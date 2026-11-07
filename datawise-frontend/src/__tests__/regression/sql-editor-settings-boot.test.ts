import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {createDefaultAppConfig} from '@/shared/config/app-config.defaults'
import {applyAppConfigFile} from '@/shared/config/app-config.service'

function mockLocalStorage() {
    const store = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => store.set(key, value),
            removeItem: (key: string) => store.delete(key),
        },
    })
}

describe('sql editor settings survive app config apply', () => {
    mockLocalStorage()

    it('does not apply empty sql-editor envelopes (would wipe dedicated LS)', () => {
        const calls: string[] = []
        applyAppConfigFile(createDefaultAppConfig(), {
            applyLayout: () => undefined,
            applySqlEditorShortcuts: () => calls.push('personal'),
            applySqlEditorShortcutsShared: () => calls.push('shared'),
        })
        assert.deepEqual(calls, [])
    })

    it('applies sql-editor envelope only when it has overrides', () => {
        const calls: string[] = []
        const file = createDefaultAppConfig()
        file.sqlEditorShortcuts = {showHintBar: false, fontSize: 16}
        file.sqlEditorShortcutsShared = {autoTableAlias: true}
        applyAppConfigFile(file, {
            applyLayout: () => undefined,
            applySqlEditorShortcuts: () => calls.push('personal'),
            applySqlEditorShortcutsShared: () => calls.push('shared'),
        })
        assert.deepEqual(calls, ['shared', 'personal'])
    })
})
