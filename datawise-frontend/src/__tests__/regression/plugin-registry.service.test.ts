import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import type {PluginItem} from '@/core/types'
import {
    filterPluginGatedMenuItems,
    isShortcutPanelEnabled,
    listPluginSurfaceIds,
    listPluginRequires,
    listDbTypesForPlugin,
    mergePluginCatalog,
    normalizePluginId,
    pluginHasUnmetRequires,
    pluginRequiresSatisfied,
    pluginHasSurface,
    resolveDbTypesForPlugins,
    resolveSqlSnippetLayerEnabled,
    resolvePluginEnabled,
    resolvePluginSettingsTab,
    shortcutPanelForPlugin,
} from '@/features/plugin/services/plugin-registry.service'

describe('plugin-registry.service', () => {
    const catalog: PluginItem[] = [
        {
            id: 'p-grid-export',
            name: 'Export',
            version: '1.0.0',
            author: 'DataWise',
            description: 'export',
            enabled: true,
            category: 'export',
        },
        {
            id: 'p-redis-explorer',
            name: 'Redis',
            version: '1.0.0',
            author: 'DataWise',
            description: 'redis',
            enabled: false,
            category: 'datasource',
        },
    ]

    it('normalizePluginId maps legacy ids', () => {
        assert.equal(normalizePluginId('p-csv-export'), 'p-grid-export')
        assert.equal(normalizePluginId('p-grid-export'), 'p-grid-export')
    })

    it('mergePluginCatalog applies overrides on catalog defaults', () => {
        const merged = mergePluginCatalog(catalog, {
            'p-grid-export': false,
            'p-csv-export': true,
        })
        assert.equal(merged.find((item) => item.id === 'p-grid-export')?.enabled, true)
        assert.equal(merged.find((item) => item.id === 'p-redis-explorer')?.enabled, false)
    })

    it('mergePluginCatalog applies overrides when catalog uses legacy ids', () => {
        const legacyCatalog: PluginItem[] = [
            {
                id: 'p-csv-export',
                name: 'Export',
                version: '1.0.0',
                author: 'DataWise',
                description: 'export',
                enabled: true,
                category: 'export',
            },
        ]
        const merged = mergePluginCatalog(legacyCatalog, {'p-grid-export': false})
        assert.equal(merged[0]?.id, 'p-grid-export')
        assert.equal(merged[0]?.enabled, false)
    })

    it('resolvePluginEnabled falls back to catalog default', () => {
        assert.equal(resolvePluginEnabled('p-redis-explorer', catalog, {}), false)
        assert.equal(resolvePluginEnabled('p-grid-export', catalog, {}), true)
        assert.equal(resolvePluginEnabled('p-grid-export', catalog, {'p-grid-export': false}), false)
    })

    it('resolveDbTypesForPlugins hides redis when plugin disabled', () => {
        const types = resolveDbTypesForPlugins(['mysql', 'redis', 'postgresql'], (id) =>
            id !== 'p-redis-explorer',
        )
        assert.deepEqual(types, ['mysql', 'postgresql'])
    })

    it('resolveDbTypesForPlugins hides mysql and postgresql when plugins disabled', () => {
        const types = resolveDbTypesForPlugins(
            ['mysql', 'postgresql', 'sqlite'],
            (id) => id !== 'p-mysql-explorer' && id !== 'p-postgresql-explorer',
        )
        assert.deepEqual(types, ['sqlite'])
    })

    it('resolveDbTypesForPlugins hides kafka and mongodb when plugins disabled', () => {
        const types = resolveDbTypesForPlugins(
            ['mysql', 'kafka', 'mongodb', 'postgresql'],
            (id) => id !== 'p-kafka-explorer' && id !== 'p-mongo-explorer',
        )
        assert.deepEqual(types, ['mysql', 'postgresql'])
    })

    it('resolveDbTypesForPlugins hides starrocks and doris when plugins disabled', () => {
        const types = resolveDbTypesForPlugins(
            ['mysql', 'starrocks', 'doris', 'postgresql'],
            (id) => id !== 'p-starrocks-explorer' && id !== 'p-doris-explorer',
        )
        assert.deepEqual(types, ['mysql', 'postgresql'])
    })

    it('resolveDbTypesForPlugins hides trino and presto when plugin disabled', () => {
        const types = resolveDbTypesForPlugins(
            ['mysql', 'trino', 'presto', 'postgresql'],
            (id) => id !== 'p-trino-explorer',
        )
        assert.deepEqual(types, ['mysql', 'postgresql'])
    })

    it('resolveDbTypesForPlugins hides clickhouse and sqlite when plugins disabled', () => {
        const types = resolveDbTypesForPlugins(
            ['mysql', 'clickhouse', 'sqlite', 'postgresql'],
            (id) => id !== 'p-clickhouse-explorer' && id !== 'p-sqlite-explorer',
        )
        assert.deepEqual(types, ['mysql', 'postgresql'])
    })

    it('resolveDbTypesForPlugins hides oracle and hive when plugins disabled', () => {
        const types = resolveDbTypesForPlugins(
            ['mysql', 'oracle', 'hive', 'postgresql'],
            (id) => id !== 'p-oracle-explorer' && id !== 'p-hive-explorer',
        )
        assert.deepEqual(types, ['mysql', 'postgresql'])
    })

    it('resolveDbTypesForPlugins hides sqlserver and mariadb when plugins disabled', () => {
        const types = resolveDbTypesForPlugins(
            ['mysql', 'sqlserver', 'mariadb', 'postgresql'],
            (id) => id !== 'p-sqlserver-explorer' && id !== 'p-mariadb-explorer',
        )
        assert.deepEqual(types, ['mysql', 'postgresql'])
    })

    it('resolveDbTypesForPlugins hides dm db2 and oceanbase when plugins disabled', () => {
        const types = resolveDbTypesForPlugins(
            ['mysql', 'dm', 'db2', 'oceanbase'],
            (id) =>
                id !== 'p-dm-explorer' && id !== 'p-db2-explorer' && id !== 'p-oceanbase-explorer',
        )
        assert.deepEqual(types, ['mysql'])
    })

    it('resolveDbTypesForPlugins hides kingbase when plugin disabled', () => {
        const types = resolveDbTypesForPlugins(
            ['postgresql', 'kingbase'],
            (id) => id !== 'p-kingbase-explorer',
        )
        assert.deepEqual(types, ['postgresql'])
    })

    it('resolveDbTypesForPlugins hides flink when plugin disabled', () => {
        const types = resolveDbTypesForPlugins(
            ['mysql', 'flink'],
            (id) => id !== 'p-flink-explorer',
        )
        assert.deepEqual(types, ['mysql'])
    })

    it('listDbTypesForPlugin maps explorer plugins to db types', () => {
        assert.deepEqual(listDbTypesForPlugin('p-trino-explorer'), ['trino', 'presto'])
        assert.deepEqual(listDbTypesForPlugin('p-oracle-explorer'), ['oracle'])
        assert.deepEqual(listDbTypesForPlugin('p-mysql-explorer'), ['mysql'])
        assert.deepEqual(listDbTypesForPlugin('p-postgresql-explorer'), ['postgresql'])
        assert.deepEqual(listDbTypesForPlugin('p-grid-export'), [])
    })

    it('filterPluginGatedMenuItems removes schema and cross-env when plugins disabled', () => {
        const items = [
            {id: 'schema-compare', label: 'Schema'},
            {id: 'cross-env-compare', label: 'Cross'},
            {id: 'copy-name', label: 'Copy'},
        ]
        const filtered = filterPluginGatedMenuItems(items, () => false)
        assert.deepEqual(filtered.map((item) => item.id), ['copy-name'])
    })

    it('isShortcutPanelEnabled respects plugin map', () => {
        assert.equal(isShortcutPanelEnabled('info', () => false), true)
        assert.equal(isShortcutPanelEnabled('console', () => false), false)
        assert.equal(isShortcutPanelEnabled('console', () => true), true)
    })

    it('listPluginSurfaceIds includes shortcutRail and pluginHasSurface works', () => {
        const surfaces = listPluginSurfaceIds()
        assert.ok(surfaces.includes('shortcutRail'))
        assert.equal(pluginHasSurface('p-sql-history', 'shortcutRail'), true)
        assert.equal(pluginHasSurface('p-grid-export', 'shortcutRail'), false)
    })

    it('shortcutPanelForPlugin resolves panel from plugin id', () => {
        assert.equal(shortcutPanelForPlugin('p-sql-bookmarks'), 'console')
        assert.equal(shortcutPanelForPlugin('p-grid-export'), null)
    })

    it('resolveDbTypesForPlugins keeps redis when plugin enabled', () => {
        const types = resolveDbTypesForPlugins(['mysql', 'redis', 'postgresql'], () => true)
        assert.deepEqual(types, ['mysql', 'redis', 'postgresql'])
    })

    it('resolvePluginEnabled hides monitor when legacy history override is disabled', () => {
        const extendedCatalog: PluginItem[] = [
            ...catalog,
            {
                id: 'p-sql-monitor',
                name: 'Monitor',
                version: '1.0.0',
                author: 'DataWise',
                description: 'monitor',
                enabled: true,
                category: 'tool',
            },
        ]
        assert.equal(
            resolvePluginEnabled('p-sql-monitor', extendedCatalog, {'p-sql-history': false}),
            false,
        )
        assert.equal(
            resolvePluginEnabled('p-sql-monitor', extendedCatalog, {'p-sql-monitor': true, 'p-sql-history': false}),
            true,
        )
    })

    it('listPluginRequires returns registry hints', () => {
        assert.deepEqual(listPluginRequires('p-ai-explain'), ['p-console-ai', 'p-explain-plan'])
        assert.deepEqual(listPluginRequires('p-dml-generate'), [])
    })

    it('resolveSqlSnippetLayerEnabled respects legacy p-sql-snippets off', () => {
        const snippetCatalog: PluginItem[] = [
            {
                id: 'p-sql-snippets',
                name: 'Bundled',
                version: '1.0.0',
                author: 'DataWise',
                description: 'bundled',
                enabled: true,
                category: 'tool',
            },
            {
                id: 'p-sql-snippets-team',
                name: 'Team',
                version: '1.0.0',
                author: 'DataWise',
                description: 'team',
                enabled: true,
                category: 'tool',
            },
        ]
        assert.equal(
            resolveSqlSnippetLayerEnabled('team', snippetCatalog, {'p-sql-snippets': false}),
            false,
        )
        assert.equal(
            resolveSqlSnippetLayerEnabled('team', snippetCatalog, {
                'p-sql-snippets': false,
                'p-sql-snippets-team': true,
            }),
            true,
        )
    })

    it('pluginRequiresSatisfied and pluginHasUnmetRequires detect disabled dependencies', () => {
        const plugin: PluginItem = {
            id: 'p-ai-explain',
            name: 'AI explain',
            version: '1.0.0',
            author: 'DataWise',
            description: 'explain',
            enabled: true,
            category: 'ai',
        }
        assert.equal(pluginRequiresSatisfied('p-ai-explain', () => true), true)
        assert.equal(
            pluginRequiresSatisfied('p-ai-explain', (id) => id !== 'p-console-ai'),
            false,
        )
        assert.equal(pluginHasUnmetRequires(plugin, () => true), false)
        assert.equal(pluginHasUnmetRequires(plugin, (id) => id !== 'p-console-ai'), true)
    })

    it('resolvePluginSettingsTab returns plugins for explorer and sqlEditor for snippets', () => {
        assert.equal(resolvePluginSettingsTab('p-mysql-explorer'), 'plugins')
        assert.equal(resolvePluginSettingsTab('p-sql-snippets'), 'sqlSnippets')
        assert.equal(resolvePluginSettingsTab('p-grid-export'), undefined)
    })
})
