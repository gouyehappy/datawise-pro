/**
 * 应用入口（整个前端从这里开始）
 *
 * 启动顺序：
 *   index.html → theme-boot.js → boot-watchdog.js → Vue 挂载 → Shell 骨架 / AppSplash
 */
import {installPluginHookHost} from './features/plugin/services/plugin-hook-host'
import {registerBuiltinFeatures} from '@/app/register-builtin-features'

installPluginHookHost()
registerBuiltinFeatures()

import './theme-init'
/** UI Latin: Geist + JetBrains Mono (latin subset). CJK Noto SC loaded for zh-CN. */
import './styles/fonts-ui-latin.css'
import './styles/global.css'
import {ensureNotoSansScFont} from './styles/ensure-noto-sans-sc'

// Match i18n LOCALE_STORAGE_KEY without importing i18n before mount graph.
try {
    const storedLocale = localStorage.getItem('dw-cli-locale')
    if (storedLocale !== 'en-US') {
        void ensureNotoSansScFont()
    }
} catch {
    void ensureNotoSansScFont()
}

import {createApp} from 'vue'
import {createPinia, setActivePinia} from 'pinia'
import {registerDwIcons} from '@datawise/icons'
import {DW_TOAST} from '@datawise/theme'
import {DW_ICON_REGISTRY} from '@/core/icons/registry'
import {getDwToastController} from '@/core/toast/dw-toast-singleton'
import App from './app/App.vue'
import {i18n} from './i18n'
import {setupExplorerContextMenus} from './features/explorer/setup-context-menus'
import {registerSqlEditorApp} from '@/features/workspace/services/ensure-sql-editor-plugin'

import {registerApiErrorNotifier} from '@/shared/api/http/api-error-notifier'
import {HTTP_NOT_READY} from '@/shared/api/http/request'
import {resolveDisplayApiErrorMessage} from '@/shared/api/http/api-error-message'
import {ApiError} from '@/shared/api/http/api-error'
import {useToastStore} from '@/features/layout/stores/toast-store'
import {shouldSuppressApiErrorToast} from '@/features/layout/services/api-error-toast-policy.service'
import {markBackendOffline} from '@/features/layout/services/backend-health.service'
import {installUnauthorizedSessionRecovery} from '@/features/auth/services/auth-session-recovery.service'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {installClipboardFallback} from '@/shared/browser/clipboard-fallback'
import {writeClipboardText} from '@/shared/browser/app-clipboard'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {notifyDesktopAppMountedAfterPaint} from '@/features/layout/services/desktop-app-mounted.service'
import {installOverlayScrollbarHosts} from '@/core/composables/installOverlayScrollbarHosts'
import {installAutohideScrollbar} from '@/core/composables/installAutohideScrollbar'

setupExplorerContextMenus()
installClipboardFallback()
installOverlayScrollbarHosts()
installAutohideScrollbar()

/** Monaco cancels in-flight clipboard promises on blur; ignore those rejections in console. */
window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    if (!reason) return
    const name = typeof reason === 'object' && reason !== null && 'name' in reason
        ? String((reason as {name?: unknown}).name)
        : ''
    const message = reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
            ? reason
            : ''
    if (name === 'Canceled' || message === 'Canceled') {
        event.preventDefault()
    }
})

/** Package components (`@datawise/data-grid`, CollapseIcon, …) resolve via `@datawise/icons`. */
registerDwIcons(DW_ICON_REGISTRY)

const pinia = createPinia()
setActivePinia(pinia)
installUnauthorizedSessionRecovery()

registerApiErrorNotifier((message, error) => {
    if (error instanceof ApiError && error.data && typeof error.data === 'object') {
        const data = error.data as {errorCode?: unknown; packId?: unknown}
        const code = typeof data.errorCode === 'string' ? data.errorCode : null
        const packId = typeof data.packId === 'string' ? data.packId : null
        if (code === 'PASSWORD_CHANGE_REQUIRED') {
            useAuthStore().mustChangePassword = true
        }
        if (code) {
            useEntitlementStore().handlePackEntitlementError(code, packId)
        }
    }
    if (shouldSuppressApiErrorToast(error)) return
    if (message === HTTP_NOT_READY || message.startsWith('HTTP API request failed')) {
        markBackendOffline()
    }
    const display = resolveDisplayApiErrorMessage(error, (key) => String(i18n.global.t(key)))
    useToastStore().showError(display)
})

const app = createApp(App).use(pinia).use(i18n)
app.provide(DW_TOAST, getDwToastController())
registerSqlEditorApp(app)

/** Surface render errors to the user (toast); keep console detail for desktop support. */
app.config.errorHandler = (err, _instance, info) => {
    console.error('[datawise] vue error', info, err)
    try {
        const toast = useToastStore()
        const detail = err instanceof Error
            ? `${err.name}: ${err.message}\n${err.stack ?? ''}`.trim()
            : String(err ?? '')
        const diagnostics = `[datawise] vue render error\ninfo=${info ?? ''}\n${detail}`
        toast.show(String(i18n.global.t('common.vueRenderError')), {
            variant: 'error',
            durationMs: 12_000,
            action: {
                label: String(i18n.global.t('common.copyDiagnostics')),
                onClick: () => {
                    void writeClipboardText(diagnostics)
                },
            },
        })
    } catch {
        // Toast store may be unavailable during early boot
    }
}

try {
    app.mount('#app')
    notifyDesktopAppMountedAfterPaint()
} catch (error) {
    console.error('[datawise] app mount failed', error)
    throw error
}
