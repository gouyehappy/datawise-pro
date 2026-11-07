import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import type {DataSourceOption} from '@/core/types'
import {
    filterSelectableDataSources,
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
