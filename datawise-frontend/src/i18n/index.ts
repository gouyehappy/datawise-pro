import {createI18n} from 'vue-i18n'
import {ref} from 'vue'
import zhCN from './locales/zh-CN/index'
import {persistDesktopChromePatch} from '@/shared/browser/desktop-chrome-persist'
import {isNativeDesktopHost} from '@/shared/browser/desktop-bridge'

export type AppLocale = 'zh-CN' | 'en-US'

export const LOCALE_STORAGE_KEY = 'dw-cli-locale'
const DEFAULT_LOCALE: AppLocale = 'zh-CN'

/** True when dedicated locale key is set (runtime authority present). */
export function localeStorageHasValue(): boolean {
    if (typeof localStorage === 'undefined') return false
    try {
        return localStorage.getItem(LOCALE_STORAGE_KEY) != null
    } catch {
        return false
    }
}

function readStoredLocale(): AppLocale {
    if (typeof localStorage === 'undefined') return DEFAULT_LOCALE
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    return stored === 'en-US' ? 'en-US' : DEFAULT_LOCALE
}

/**
 * Runtime authority: `dw-cli-locale`.
 * App-config `locale` is import/export envelope — hydrate only when dedicated key is empty.
 */
export function hydrateLocaleFromEnvelope(
    locale: AppLocale | string | null | undefined,
    apply: (next: AppLocale) => void,
): void {
    if (!locale || localeStorageHasValue()) return
    if (locale === 'en-US' || locale === 'zh-CN') apply(locale)
}

const initialLocale = readStoredLocale()
const messages: Record<string, typeof zhCN> = {
    'zh-CN': zhCN,
}

// Default locale stays in the main graph; the other locale is a separate async chunk.
if (initialLocale === 'en-US') {
    messages['en-US'] = (await import('./locales/en-US/index')).default
}

const loadedLocales = new Set<AppLocale>(
    initialLocale === 'en-US' ? ['zh-CN', 'en-US'] : ['zh-CN'],
)
const localeLoaders = new Map<AppLocale, Promise<void>>()

export const currentLocale = ref<AppLocale>(initialLocale)

export const i18n = createI18n({
    legacy: false,
    locale: currentLocale.value,
    fallbackLocale: DEFAULT_LOCALE,
    messages,
})

async function ensureLocaleLoaded(locale: AppLocale): Promise<void> {
    if (loadedLocales.has(locale)) return
    const pending = localeLoaders.get(locale)
    if (pending) {
        await pending
        return
    }
    const task = (async () => {
        if (locale === 'en-US') {
            const mod = await import('./locales/en-US/index')
            i18n.global.setLocaleMessage('en-US', mod.default)
        } else {
            i18n.global.setLocaleMessage('zh-CN', zhCN)
        }
        loadedLocales.add(locale)
    })()
    localeLoaders.set(locale, task)
    try {
        await task
    } finally {
        localeLoaders.delete(locale)
    }
}

/** Apply UI locale; loads the locale chunk on first use when not already present. */
export function setLocale(locale: AppLocale) {
    void ensureLocaleLoaded(locale).then(() => {
        currentLocale.value = locale
        i18n.global.locale.value = locale
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(LOCALE_STORAGE_KEY, locale)
        }
        if (typeof document !== 'undefined') {
            document.documentElement.lang = locale
        }
        // Desktop: machine last-write (desktop-chrome.json), not per app user.
        if (isNativeDesktopHost()) {
            persistDesktopChromePatch({locale})
        }
    })
}

export function toggleLocale() {
    setLocale(currentLocale.value === 'zh-CN' ? 'en-US' : 'zh-CN')
}

/** 在非组件代码（store / service）中使用 */
export function t(key: string, values?: Record<string, unknown>): string {
    return i18n.global.t(key, values ?? {})
}
