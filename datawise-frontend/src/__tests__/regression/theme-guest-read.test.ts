import assert from 'node:assert/strict'
import test from 'node:test'
import {THEME_STORAGE_KEY} from '@/shared/config/theme-presets'
import {readStoredThemePreferences, readThemePreferencesOnBoot} from '@/shared/config/theme-preferences-storage'
import {setAppConfigStorageScope} from '@/shared/config/app-config-storage-scope'
import {persistSession} from '@/shared/auth/session'
import {EDITOR_STORAGE_KEY} from '@/shared/config/editor-presets'
import {readStoredEditorSettings} from '@/shared/config/editor-settings-storage'

function mockLocalStorage(): Map<string, string> {
    const store = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => store.set(key, value),
            removeItem: (key: string) => store.delete(key),
        },
    })
    return store
}

test('guest can read last-saved theme prefs without write permission', () => {
    const store = mockLocalStorage()
    persistSession('session-guest', 'guest', true)
    setAppConfigStorageScope({isGuest: true})

    const saved = {
        appearance: 'dark',
        background: 'warm',
        primary: 'rose',
        uiSkin: 'ide',
    }
    store.set(THEME_STORAGE_KEY, JSON.stringify(saved))
    store.set(`${THEME_STORAGE_KEY}:guest`, JSON.stringify(saved))

    const expected = {
        ...saved,
        uiFont: 'geist',
        uiFontCustom: '',
        uiTextScale: 'md',
        uiFontSizePx: 13.5,
        uiDensity: 'md',
    }
    assert.deepEqual(readStoredThemePreferences(), expected)
    assert.deepEqual(readThemePreferencesOnBoot(), expected)
})

test('guest can read last-saved editor prefs without write permission', () => {
    const store = mockLocalStorage()
    persistSession('session-guest', 'guest', true)
    setAppConfigStorageScope({isGuest: true})

    const saved = {
        theme: 'one-dark',
        fontFamily: 'JetBrains Mono',
        fontSize: 15,
        lineHeight: 1.6,
        lineNumbers: true,
        minimap: false,
        wordWrap: true,
        folding: true,
        maxResultRows: 1000,
        defaultGridPageSize: 100,
        slowQueryThresholdMs: 500,
        productionPerfMode: false,
    }
    store.set(EDITOR_STORAGE_KEY, JSON.stringify(saved))
    store.set(`${EDITOR_STORAGE_KEY}:guest`, JSON.stringify(saved))

    const read = readStoredEditorSettings()
    assert.equal(read.fontSize, 15)
    assert.equal(read.theme, 'one-dark')
    assert.equal(read.minimap, false)
})
