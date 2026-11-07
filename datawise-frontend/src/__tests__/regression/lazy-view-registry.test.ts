import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    createLazyView,
    PanelLoadError,
    PanelLoadingShell,
    prefetchLazyLoaders,
    scheduleIdleWarmup,
} from '@/core/registry/create-lazy-view'
import {
    WORKSPACE_TAB_WARMUP_TYPES,
    resolveWorkspaceTab,
    resetWorkspaceTabContributionCache,
} from '@/features/workspace/tab-registry'
import {
    SETTINGS_PANEL_WARMUP_SECTIONS,
    resolveSettingsPanel,
} from '@/features/settings/settings-section-registry'
import {
    resolveWorkbenchModule,
    resetWorkbenchModuleContributionCache,
} from '@/features/layout/module-registry'
import {workbenchNavFeature} from '@/features/layout/workbench-nav.feature'
import {workspaceShellFeature} from '@/features/workspace/workspace-shell.feature'
import {registerFeatures, resetFeatureRegistry} from '@/core/feature-contract'

describe('create-lazy-view + registries', () => {
    it('createLazyView returns an async component definition', () => {
        const component = createLazyView(async () => ({default: {name: 'StubPanel'}}))
        assert.ok(component)
        assert.equal(PanelLoadingShell.name, 'PanelLoadingShell')
        assert.equal(PanelLoadError.name, 'PanelLoadError')
    })

    it('prefetchLazyLoaders invokes every loader', async () => {
        let hits = 0
        await prefetchLazyLoaders([
            async () => {
                hits += 1
                return {default: {name: 'A'}}
            },
            null,
            async () => {
                hits += 1
                return {default: {name: 'B'}}
            },
        ])
        assert.equal(hits, 2)
    })

    it('scheduleIdleWarmup runs the task', async () => {
        let ran = false
        await new Promise<void>((resolve) => {
            scheduleIdleWarmup(() => {
                ran = true
                resolve()
            }, 50)
        })
        assert.equal(ran, true)
    })

    it('workspace tab registry resolves common tabs', () => {
        resetFeatureRegistry()
        resetWorkspaceTabContributionCache()
        registerFeatures([workspaceShellFeature])
        for (const type of WORKSPACE_TAB_WARMUP_TYPES) {
            assert.ok(resolveWorkspaceTab(type), `missing tab component for ${type}`)
        }
        resetWorkspaceTabContributionCache()
        resetFeatureRegistry()
    })

    it('settings panel registry resolves warmup sections', () => {
        for (const section of SETTINGS_PANEL_WARMUP_SECTIONS) {
            assert.ok(resolveSettingsPanel(section), `missing settings panel for ${section}`)
        }
    })

    it('workbench module registry resolves dashboard and settings via contributions', () => {
        resetFeatureRegistry()
        resetWorkbenchModuleContributionCache()
        registerFeatures([workbenchNavFeature])
        assert.ok(resolveWorkbenchModule('dashboard'))
        assert.ok(resolveWorkbenchModule('settings'))
        resetWorkbenchModuleContributionCache()
        resetFeatureRegistry()
    })
})
