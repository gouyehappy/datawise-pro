import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {formatRuntimeBytes} from '@/features/settings/services/runtime-format.service'
import {
    canUninstallConnector,
    isRedundantPluginJar,
} from '@/features/datasource/services/connector-market.service'
import {
    clearRuntimeSetupCompleted,
    isRuntimeSetupCompleted,
    markRuntimeSetupCompleted,
    RUNTIME_SETUP_COMPLETED_KEY,
} from '@/features/onboarding/services/runtime-setup.service'
import type {ConnectorMarketEntry} from '@/features/datasource/types/datasource.types'

describe('formatRuntimeBytes', () => {
    it('formats zero and small values', () => {
        assert.equal(formatRuntimeBytes(0), '0 B')
        assert.equal(formatRuntimeBytes(512), '512 B')
    })

    it('formats kilobytes and megabytes', () => {
        assert.equal(formatRuntimeBytes(2048), '2 KB')
        assert.equal(formatRuntimeBytes(Math.round(2.5 * 1024 * 1024)), '2.5 MB')
    })
})

describe('runtime setup completion flag', () => {
    it('marks and clears completed state', () => {
        const store = new Map<string, string>()
        const storage = {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => { store.set(key, value) },
            removeItem: (key: string) => { store.delete(key) },
        } as Storage

        assert.equal(isRuntimeSetupCompleted(storage), false)
        markRuntimeSetupCompleted(storage)
        assert.equal(storage.getItem(RUNTIME_SETUP_COMPLETED_KEY), '1')
        assert.equal(isRuntimeSetupCompleted(storage), true)
        clearRuntimeSetupCompleted(storage)
        assert.equal(isRuntimeSetupCompleted(storage), false)
    })
})

describe('canUninstallConnector', () => {
    const entry: ConnectorMarketEntry = {
        id: 'mysql',
        label: 'MySQL',
        primary: true,
        available: true,
        capabilities: [],
        jarName: 'datawise-connector-mysql-4.0.1.jar',
        integrityStatus: 'bundled',
        redundantOnDisk: true,
    }

    it('allows admin uninstall when jar is present', () => {
        assert.equal(canUninstallConnector(entry, true), true)
    })

    it('denies non-admin', () => {
        assert.equal(canUninstallConnector(entry, false), false)
    })

    it('allows cleanup even when connector stays available via classpath', () => {
        assert.equal(canUninstallConnector({...entry, available: true}, true), true)
    })

    it('allows cleanup when connector is not available but jar remains on disk', () => {
        assert.equal(canUninstallConnector({...entry, available: false}, true), true)
    })

    it('denies when no jarName', () => {
        assert.equal(canUninstallConnector({...entry, jarName: null}, true), false)
    })

    it('denies bundled classpath connectors with no redundant on-disk JAR', () => {
        assert.equal(
            canUninstallConnector({...entry, redundantOnDisk: false, integrityStatus: 'bundled'}, true),
            false,
        )
    })
})

describe('isRedundantPluginJar', () => {
    it('detects bundled + on-disk jar', () => {
        assert.equal(isRedundantPluginJar({
            id: 'oracle',
            label: 'Oracle',
            primary: false,
            available: true,
            capabilities: [],
            jarName: 'datawise-connector-oracle-4.0.1.jar',
            integrityStatus: 'bundled',
        }), true)
    })

    it('is false for truly loaded plugins', () => {
        assert.equal(isRedundantPluginJar({
            id: 'redis',
            label: 'Redis',
            primary: true,
            available: true,
            capabilities: [],
            jarName: 'datawise-connector-redis-4.0.1-plugin.jar',
            integrityStatus: 'unsigned',
            redundantOnDisk: false,
        }), false)
    })
})
