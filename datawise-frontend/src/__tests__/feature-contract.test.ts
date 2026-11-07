import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    defineFeature,
    listFeatureMenuContributionsForSlot,
    listFeatureNavModuleContributions,
    listFeaturePaletteContributions,
    listFeatureSettingsContributions,
    listFeatureTabContributions,
    listRegisteredFeatures,
    registerFeatures,
    resetFeatureRegistry,
    resolveFeatureTabContribution,
    resolveNavModuleContribution,
    resolveShellSlotForModule,
} from '@/core/feature-contract'

describe('feature-contract', () => {
    it('defineFeature requires id and valid palette entries', () => {
        assert.throws(() => defineFeature({id: ''}), /id is required/)
        assert.throws(
            () =>
                defineFeature({
                    id: 'x',
                    contributes: {
                        palette: [{id: '', labelKey: 'a', groupKey: 'b', action: {kind: 'openDataCatalog'}}],
                    },
                }),
            /missing id/,
        )
        const ok = defineFeature({
            id: 'demo',
            contributes: {
                palette: [
                    {
                        id: 'module:demo',
                        labelKey: 'l',
                        groupKey: 'g',
                        action: {kind: 'setModule', module: 'database'},
                    },
                ],
            },
        })
        assert.equal(ok.id, 'demo')
    })

    it('registerFeatures accumulates palette contributions', () => {
        resetFeatureRegistry()
        registerFeatures([
            defineFeature({
                id: 'community-plugin',
                contributes: {
                    palette: [
                        {
                            id: 'module:communityPlugin',
                            labelKey: 'commandPalette.modules.communityPlugin',
                            groupKey: 'commandPalette.groups.navigation',
                            action: {kind: 'setModule', module: 'communityPlugin'},
                        },
                    ],
                },
            }),
        ])
        assert.equal(listRegisteredFeatures().length, 1)
        assert.deepEqual(
            listFeaturePaletteContributions().map((c) => c.id),
            ['module:communityPlugin'],
        )
        resetFeatureRegistry()
    })

    it('palette contributions sort by order', () => {
        resetFeatureRegistry()
        registerFeatures([
            defineFeature({
                id: 'later',
                contributes: {
                    palette: [
                        {
                            id: 'module:settings',
                            labelKey: 'l',
                            groupKey: 'g',
                            order: 100,
                            action: {kind: 'setModule', module: 'settings'},
                        },
                    ],
                },
            }),
            defineFeature({
                id: 'earlier',
                contributes: {
                    palette: [
                        {
                            id: 'module:dashboard',
                            labelKey: 'l',
                            groupKey: 'g',
                            order: 10,
                            action: {kind: 'setModule', module: 'dashboard'},
                        },
                    ],
                },
            }),
        ])
        assert.deepEqual(
            listFeaturePaletteContributions().map((c) => c.id),
            ['module:dashboard', 'module:settings'],
        )
        resetFeatureRegistry()
    })

    it('navModules resolve shell-slot and workspace-open', () => {
        resetFeatureRegistry()
        registerFeatures([
            defineFeature({
                id: 'layout-shell-slots',
                contributes: {
                    navModules: [
                        {module: 'database', kind: 'shell-slot', shell: 'database'},
                        {module: 'ai', kind: 'shell-slot', shell: 'ai'},
                    ],
                },
            }),
            defineFeature({
                id: 'community-plugin',
                contributes: {
                    navModules: [
                        {module: 'communityPlugin', kind: 'workspace-open', open: 'communityPluginCenter'},
                    ],
                },
            }),
        ])
        assert.equal(listFeatureNavModuleContributions().length, 3)
        assert.equal(resolveShellSlotForModule('database'), 'database')
        assert.equal(resolveShellSlotForModule('ai'), 'ai')
        assert.equal(resolveShellSlotForModule('settings'), null)
        assert.equal(resolveNavModuleContribution('communityPlugin')?.kind, 'workspace-open')
        assert.equal(resolveNavModuleContribution('communityPlugin')?.open, 'communityPluginCenter')
        assert.throws(
            () =>
                defineFeature({
                    id: 'bad',
                    contributes: {navModules: [{module: 'ai', kind: 'shell-slot'}]},
                }),
            /needs shell/,
        )
        resetFeatureRegistry()
    })

    it('menus and settings contributions validate and list', () => {
        assert.throws(
            () =>
                defineFeature({
                    id: 'bad-menu',
                    contributes: {
                        menus: [{id: 'x', slot: '', labelKey: 'l', action: {kind: 'openDataCatalog'}}],
                    },
                }),
            /needs slot/,
        )
        resetFeatureRegistry()
        registerFeatures([
            defineFeature({
                id: 'ai',
                contributes: {
                    settings: [
                        {id: 'ai', labelKey: 'settings.nav.aiModels', groupKey: 'settings.nav.groups.ai'},
                    ],
                    menus: [
                        {
                            id: 'settings:ai',
                            slot: 'settings.nav',
                            labelKey: 'settings.nav.aiModels',
                            action: {kind: 'openSettings', section: 'ai'},
                        },
                    ],
                },
            }),
        ])
        assert.equal(listFeatureSettingsContributions().length, 1)
        assert.equal(listFeatureMenuContributionsForSlot('settings.nav').length, 1)
        resetFeatureRegistry()
    })

    it('tabs contributions validate and list', () => {
        assert.throws(
            () =>
                defineFeature({
                    id: 'bad-tabs',
                    contributes: {
                        tabs: [{type: 'console', loader: undefined as never}],
                    },
                }),
            /needs loader/,
        )
        assert.throws(
            () =>
                defineFeature({
                    id: 'dup-tabs',
                    contributes: {
                        tabs: [
                            {type: 'nacos-configs', loader: async () => ({})},
                            {type: 'nacos-configs', loader: async () => ({})},
                        ],
                    },
                }),
            /duplicate tabs type/,
        )
        assert.throws(
            () =>
                defineFeature({
                    id: 'bad-module-loader',
                    contributes: {
                        navModules: [
                            {
                                module: 'dashboard',
                                kind: 'module-page',
                                loader: 'not-a-function' as never,
                            },
                        ],
                    },
                }),
            /loader must be a function/,
        )

        resetFeatureRegistry()
        const loader = async () => ({default: {}})
        registerFeatures([
            defineFeature({
                id: 'workspace-config-center',
                contributes: {
                    tabs: [
                        {type: 'nacos-configs', loader, asyncName: 'ConfigCenterWorkbenchTab'},
                        {type: 'nacos-services', loader, asyncName: 'ConfigCenterWorkbenchTab'},
                        {type: 'polaris-configs', loader, asyncName: 'ConfigCenterWorkbenchTab'},
                        {type: 'polaris-services', loader, asyncName: 'ConfigCenterWorkbenchTab'},
                    ],
                },
            }),
        ])
        assert.equal(listFeatureTabContributions().length, 4)
        assert.equal(resolveFeatureTabContribution('nacos-configs')?.asyncName, 'ConfigCenterWorkbenchTab')
        assert.equal(resolveFeatureTabContribution('console'), undefined)
        resetFeatureRegistry()
    })
})