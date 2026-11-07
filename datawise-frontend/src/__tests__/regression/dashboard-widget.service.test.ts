import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    createDefaultDashboardPreferences,
    moveWidget,
    normalizeDashboardPreferences,
    reorderWidgetInColumn,
    setWidgetColumn,
    setWidgetVisibility,
    visibleWidgetIdsForColumn,
} from '@/features/dashboard/services/dashboard-widget.service'

describe('dashboard-widget.service', () => {
    it('createDefaultDashboardPreferences includes all widgets visible', () => {
        const prefs = createDefaultDashboardPreferences()
        assert.equal(prefs.widgets.length, 9)
        assert.ok(prefs.widgets.every((widget) => widget.visible))
        assert.deepEqual(prefs.chartWidgets, [])
    })

    it('normalizeDashboardPreferences merges unknown ids and fills missing widgets', () => {
        const prefs = normalizeDashboardPreferences({
            widgets: [
                {id: 'recentSql', column: 'right', visible: false},
                {id: 'unknown' as never, column: 'main', visible: true},
            ],
        })
        const recentSql = prefs.widgets.find((widget) => widget.id === 'recentSql')
        assert.equal(recentSql?.column, 'right')
        assert.equal(recentSql?.visible, false)
        assert.ok(prefs.widgets.some((widget) => widget.id === 'teamActivity'))
    })

    it('visibleWidgetIdsForColumn respects visibility and order', () => {
        let prefs = createDefaultDashboardPreferences()
        prefs = setWidgetVisibility(prefs, 'quickActions', false)
        prefs = reorderWidgetInColumn(prefs, 'left', 1, 0)
        const ids = visibleWidgetIdsForColumn(prefs, 'left')
        assert.deepEqual(ids, ['connectionHealth'])
    })

    it('reorderWidgetInColumn moves widgets within a column', () => {
        const prefs = createDefaultDashboardPreferences()
        const reordered = reorderWidgetInColumn(prefs, 'right', 0, 2)
        const ids = visibleWidgetIdsForColumn(reordered, 'right')
        assert.deepEqual(ids, ['savedConsoles', 'enabledPlugins', 'openTabs', 'teamActivity'])
    })

    it('setWidgetColumn appends widget to target column', () => {
        const prefs = createDefaultDashboardPreferences()
        const moved = setWidgetColumn(prefs, 'recentSql', 'left')
        const leftIds = visibleWidgetIdsForColumn(moved, 'left')
        assert.ok(leftIds.includes('recentSql'))
        assert.ok(!visibleWidgetIdsForColumn(moved, 'main').includes('recentSql'))
    })

    it('moveWidget reorders within column and moves across columns', () => {
        const prefs = createDefaultDashboardPreferences()
        const reordered = moveWidget(prefs, 'openTabs', 'right', 2)
        assert.deepEqual(visibleWidgetIdsForColumn(reordered, 'right'), [
            'savedConsoles',
            'enabledPlugins',
            'openTabs',
            'teamActivity',
        ])

        const crossColumn = moveWidget(prefs, 'recentSql', 'right', 0)
        assert.equal(visibleWidgetIdsForColumn(crossColumn, 'right')[0], 'recentSql')
        assert.ok(!visibleWidgetIdsForColumn(crossColumn, 'main').includes('recentSql'))
    })
})
