import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import type {DataSourceOption} from '@/core/types'
import {
    filterConsoleCapableDataSources,
    filterSelectableDataSources,
    isConsoleCapableDataSource,
    isDataSourceSelectable,
    pickDefaultDataSource,
    resolvePreferredConsoleInstance,
} from '@/features/explorer/utils/data-sources.ts'

const sources: DataSourceOption[] = [
    {
        id: 'conn-ok',
        label: '192.0.2.141',
        dbType: 'mysql',
        instances: [{id: 'db-1', label: 'admin_db'}],
    },
    {
        id: 'conn-error',
        label: 'docker-mysql',
        dbType: 'mysql',
        instances: [],
    },
    {
        id: 'conn-unknown',
        label: 'legacy',
        dbType: 'mysql',
        instances: [{id: 'db-2', label: 'legacy_db'}],
    },
]

describe('console-capable data sources', () => {
    it('keeps SQL-capable connections and drops workbench plugins', () => {
        const mixed: DataSourceOption[] = [
            {
                id: 'mysql',
                label: 'prod-mysql',
                dbType: 'mysql',
                instances: [{id: 'db-1', label: 'app'}],
            },
            {
                id: 'k8s',
                label: 'Kubernetes cluster',
                dbType: 'kubernetes',
                instances: [],
            },
            {
                id: 'ssh',
                label: 'SSH 203.0.113.32',
                dbType: 'ssh',
                instances: [],
            },
            {
                id: 'redis',
                label: 'Redis 203.0.113.110',
                dbType: 'redis',
                instances: [],
            },
        ]
        assert.equal(isConsoleCapableDataSource(mixed[0]), true)
        assert.equal(isConsoleCapableDataSource(mixed[1]), false)
        assert.equal(isConsoleCapableDataSource(mixed[2]), false)
        assert.equal(isConsoleCapableDataSource(mixed[3]), false)
        assert.deepEqual(
            filterConsoleCapableDataSources(mixed).map((item) => item.id),
            ['mysql'],
        )
    })
})

describe('selectable console data sources', () => {
    const health = {
        'conn-ok': 'ok',
        'conn-error': 'error',
    } as const

    it('excludes connections with probe error', () => {
        assert.equal(isDataSourceSelectable(sources[1], health), false)
        assert.deepEqual(
            filterSelectableDataSources(sources, health).map((item) => item.id),
            ['conn-ok', 'conn-unknown'],
        )
    })

    it('picks first connectable source for new console', () => {
        assert.equal(pickDefaultDataSource(sources, health)?.id, 'conn-ok')
        assert.equal(pickDefaultDataSource(sources, health, 'conn-unknown')?.id, 'conn-unknown')
        assert.equal(
            pickDefaultDataSource(sources, health, 'conn-error')?.id,
            'conn-ok',
        )
    })

    it('allows cold (unprobed) sources so openConsole need not wake every datasource', () => {
        const cold: DataSourceOption = {
            id: 'conn-cold',
            label: 'idle',
            dbType: 'mysql',
            instances: [],
        }
        assert.equal(isDataSourceSelectable(cold, {}), true)
        assert.equal(pickDefaultDataSource([cold, ...sources], {})?.id, 'conn-cold')
        assert.equal(
            pickDefaultDataSource(sources, health, null, new Set(['conn-unknown']))?.id,
            'conn-unknown',
        )
    })
})

describe('resolvePreferredConsoleInstance', () => {
    const instances = [
        {id: 'db-mysql', label: 'mysql'},
        {id: 'db-admin', label: 'admin_db'},
    ]

    it('prefers the connection form default over the first catalog entry', () => {
        assert.deepEqual(
            resolvePreferredConsoleInstance({
                configuredDatabase: 'admin_db',
                instances,
            }),
            {instanceId: 'db-admin', database: 'admin_db'},
        )
    })

    it('binds the configured name when the tree is not loaded yet', () => {
        assert.deepEqual(
            resolvePreferredConsoleInstance({
                configuredDatabase: 'admin_db',
                instances: [],
            }),
            {instanceId: null, database: 'admin_db'},
        )
    })

    it('falls back to the first instance only when no default is configured', () => {
        assert.deepEqual(
            resolvePreferredConsoleInstance({
                instances,
                fallbackToFirst: true,
            }),
            {instanceId: 'db-mysql', database: 'mysql'},
        )
        assert.deepEqual(
            resolvePreferredConsoleInstance({
                instances,
                fallbackToFirst: false,
            }),
            {instanceId: null, database: undefined},
        )
    })
})
