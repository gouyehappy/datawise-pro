import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    DEFAULT_WORKBENCH_MODE,
    defaultModuleForWorkbenchMode,
    inferWorkbenchModeFromModule,
    isSideRailVisibleInMode,
    isShortcutRailVisibleInMode,
    isWelcomeCommonActionVisibleInMode,
    isWelcomeExploreVisibleInMode,
    isWelcomeMainPathVisibleInMode,
    isWorkbenchMode,
    normalizeWorkbenchMode,
} from '../../shared/config/workbench-mode.ts'

describe('workbench-mode', () => {
    it('normalizes unknown values to query', () => {
        assert.equal(normalizeWorkbenchMode(undefined), DEFAULT_WORKBENCH_MODE)
        assert.equal(normalizeWorkbenchMode('nope'), 'query')
        assert.equal(isWorkbenchMode('analyze'), true)
        assert.equal(isWorkbenchMode('x'), false)
    })

    it('hides pack/plugin from query mode and keeps database', () => {
        assert.equal(isSideRailVisibleInMode('database', 'query'), true)
        assert.equal(isSideRailVisibleInMode('packStore', 'query'), false)
        assert.equal(isSideRailVisibleInMode('plugin', 'query'), false)
        assert.equal(isSideRailVisibleInMode('ai', 'query'), true)
        assert.equal(isSideRailVisibleInMode('ai', 'analyze'), true)
        assert.equal(isSideRailVisibleInMode('connectorMarket', 'ops'), true)
    })

    it('filters shortcut rail by mode', () => {
        assert.equal(isShortcutRailVisibleInMode('history', 'query'), true)
        assert.equal(isShortcutRailVisibleInMode('migration', 'query'), false)
        assert.equal(isShortcutRailVisibleInMode('monitor', 'ops'), true)
        assert.equal(isShortcutRailVisibleInMode('monitor', 'analyze'), false)
    })

    it('filters welcome explore by mode', () => {
        assert.equal(isWelcomeExploreVisibleInMode('team', 'govern'), true)
        assert.equal(isWelcomeExploreVisibleInMode('team', 'query'), false)
        assert.equal(isWelcomeExploreVisibleInMode('dashboard', 'analyze'), true)
    })

    it('filters welcome main paths and common actions by mode', () => {
        assert.equal(isWelcomeMainPathVisibleInMode('ai', 'analyze'), true)
        assert.equal(isWelcomeMainPathVisibleInMode('ai', 'govern'), false)
        assert.equal(isWelcomeMainPathVisibleInMode('explore', 'govern'), false)
        assert.equal(isWelcomeCommonActionVisibleInMode('import', 'ops'), true)
        assert.equal(isWelcomeCommonActionVisibleInMode('import', 'analyze'), false)
        assert.equal(isWelcomeCommonActionVisibleInMode('ai', 'analyze'), true)
    })

    it('infers mode from modules without flipping database shells', () => {
        assert.equal(inferWorkbenchModeFromModule('ai'), 'analyze')
        assert.equal(inferWorkbenchModeFromModule('team'), 'govern')
        assert.equal(inferWorkbenchModeFromModule('plugin'), 'ops')
        assert.equal(inferWorkbenchModeFromModule('database'), null)
    })

    it('maps mode to default modules', () => {
        assert.equal(defaultModuleForWorkbenchMode('query'), 'database')
        assert.equal(defaultModuleForWorkbenchMode('analyze'), 'ai')
        assert.equal(defaultModuleForWorkbenchMode('govern'), 'team')
        assert.equal(defaultModuleForWorkbenchMode('ops'), 'database')
    })
})
