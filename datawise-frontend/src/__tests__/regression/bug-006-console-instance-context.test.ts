import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    resolveBoundInstanceId,
    resolveInstanceDisplayLabel,
} from '../../features/explorer/utils/data-sources.ts'
import {resolveConsoleInstanceLabel} from '../../features/workspace/services/resolve-console-instance.ts'

describe('resolveBoundInstanceId', () => {
    const instances = [
        {id: 'db-conn-1-admin_db', label: 'admin_db'},
        {id: 'db-conn-1-cdp', label: 'cdp'},
    ]

    it('preserves tab instanceId while tree instances are not loaded', () => {
        assert.equal(
            resolveBoundInstanceId({
                instances: [],
                tabInstanceId: 'db-conn-1-cdp',
                tabDatabase: 'cdp',
            }),
            'db-conn-1-cdp',
        )
    })

    it('matches instance by tab.database when tree loads', () => {
        assert.equal(
            resolveBoundInstanceId({
                instances,
                tabInstanceId: null,
                tabDatabase: 'cdp',
            }),
            'db-conn-1-cdp',
        )
    })

    it('does not fall back to first instance when tab.database is bound', () => {
        assert.equal(
            resolveBoundInstanceId({
                instances,
                tabInstanceId: 'stale-id',
                tabDatabase: 'cdp',
            }),
            'db-conn-1-cdp',
        )
    })

    it('preserveBinding keeps bound instance when database is not in tree', () => {
        assert.equal(
            resolveBoundInstanceId({
                instances,
                tabInstanceId: 'db-conn-1-cdp',
                tabDatabase: 'cdp',
                preserveBinding: true,
            }),
            'db-conn-1-cdp',
        )
        assert.equal(
            resolveBoundInstanceId({
                instances,
                tabInstanceId: 'stale-id',
                tabDatabase: 'missing_db',
                preserveBinding: true,
            }),
            'stale-id',
        )
        assert.equal(
            resolveBoundInstanceId({
                instances,
                tabInstanceId: null,
                tabDatabase: 'missing_db',
                preserveBinding: true,
            }),
            null,
        )
    })
})

describe('resolveInstanceDisplayLabel', () => {
    it('shows bound database label before tree instances load', () => {
        assert.equal(
            resolveInstanceDisplayLabel({
                instances: [],
                instanceId: 'db-conn-1-cdp',
                boundDatabaseLabel: 'cdp',
            }),
            'cdp',
        )
    })

    it('formats trino bound label as catalog › schema', () => {
        assert.equal(
            resolveInstanceDisplayLabel({
                instances: [],
                instanceId: null,
                boundDatabaseLabel: 'hive.a003',
                dbType: 'trino',
            }),
            'hive › a003',
        )
    })
})

describe('resolveConsoleInstanceLabel', () => {
    it('prefers active instance label from dropdown', () => {
        const label = resolveConsoleInstanceLabel({
            activeInstanceLabel: 'admin_db',
            instanceId: 'db-conn-1-admin_db',
            findNodeLabel: () => 'ignored',
        })
        assert.equal(label, 'admin_db')
    })

    it('falls back to explorer tree node label when dropdown not ready', () => {
        const label = resolveConsoleInstanceLabel({
            instanceId: 'db-conn-1-admin_db',
            findNodeLabel: (id) => (id === 'db-conn-1-admin_db' ? 'admin_db' : undefined),
        })
        assert.equal(label, 'admin_db')
    })

    it('falls back to tab.database', () => {
        const label = resolveConsoleInstanceLabel({
            tabDatabase: 'cdp',
            findNodeLabel: () => undefined,
        })
        assert.equal(label, 'cdp')
    })

    it('prefers scoped trino schema label over raw schema node label', () => {
        const label = resolveConsoleInstanceLabel({
            instanceId: 'schema-a003',
            findNodeLabel: () => 'a003_a',
            resolveScopedLabel: () => 'hive.a003_a',
        })
        assert.equal(label, 'hive.a003_a')
    })
})
