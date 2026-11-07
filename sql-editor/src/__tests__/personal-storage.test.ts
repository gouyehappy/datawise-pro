import {describe, it, beforeEach, afterEach} from 'node:test'
import assert from 'node:assert/strict'
import {
    LEGACY_PERSONAL_SHORTCUTS_KEY,
    SQL_EDITOR_PERSONAL_SETTINGS_KEY,
    clearPersonalSqlEditorLayer,
    readPersonalSqlEditorLayer,
    writePersonalSqlEditorLayer,
    hasStoredPersonalConfig,
} from '../settings/personal-storage.ts'

type StorageMock = Storage & { _data: Map<string, string> }

function createLocalStorageMock(): StorageMock {
    const data = new Map<string, string>()
    return {
        _data: data,
        get length() {
            return data.size
        },
        clear() {
            data.clear()
        },
        getItem(key: string) {
            return data.get(key) ?? null
        },
        setItem(key: string, value: string) {
            data.set(key, value)
        },
        removeItem(key: string) {
            data.delete(key)
        },
        key(index: number) {
            return [...data.keys()][index] ?? null
        },
    } as StorageMock
}

describe('settings/personal-storage', () => {
    let previous: Storage | undefined

    beforeEach(() => {
        previous = globalThis.localStorage
        globalThis.localStorage = createLocalStorageMock()
    })

    afterEach(() => {
        if (previous) globalThis.localStorage = previous
        else Reflect.deleteProperty(globalThis, 'localStorage')
    })

    it('write/read round-trip personal layer', () => {
        writePersonalSqlEditorLayer({autoTableAlias: false, fontSize: 16})
        const layer = readPersonalSqlEditorLayer()
        assert.equal(layer.autoTableAlias, false)
        assert.equal(layer.fontSize, 16)
        assert.equal(hasStoredPersonalConfig(), true)
    })

    it('empty layer clears storage key', () => {
        writePersonalSqlEditorLayer({fontSize: 14})
        writePersonalSqlEditorLayer({})
        assert.equal(globalThis.localStorage.getItem(SQL_EDITOR_PERSONAL_SETTINGS_KEY), null)
        assert.equal(hasStoredPersonalConfig(), false)
    })

    it('migrates legacy dw-cli key into canonical key once', () => {
        globalThis.localStorage.setItem(
            LEGACY_PERSONAL_SHORTCUTS_KEY,
            JSON.stringify({autoTableAlias: true, fontSize: 15}),
        )
        const layer = readPersonalSqlEditorLayer()
        assert.equal(layer.autoTableAlias, true)
        assert.equal(layer.fontSize, 15)
        assert.equal(globalThis.localStorage.getItem(LEGACY_PERSONAL_SHORTCUTS_KEY), null)
        assert.notEqual(globalThis.localStorage.getItem(SQL_EDITOR_PERSONAL_SETTINGS_KEY), null)
    })

    it('clearPersonalSqlEditorLayer removes canonical key', () => {
        writePersonalSqlEditorLayer({showHintQuickChips: false})
        clearPersonalSqlEditorLayer()
        assert.equal(globalThis.localStorage.getItem(SQL_EDITOR_PERSONAL_SETTINGS_KEY), null)
    })
})
