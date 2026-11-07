import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {createDefaultDashboardPreferences, visibleWidgetIdsForColumn} from '@/features/dashboard/services/dashboard-widget.service'
import {
    applySuggestedDashboardWidget,
    suggestDashboardWidgetFromPrompt,
} from '@/features/dashboard/services/dashboard-widget-ai.service'

describe('dashboard-widget-ai.service', () => {
    it('suggests connection health widget from prompt', () => {
        const suggestion = suggestDashboardWidgetFromPrompt('Please monitor connection health and availability')
        assert.equal(suggestion.widgetId, 'connectionHealth')
        assert.equal(suggestion.column, 'left')
    })

    it('falls back to quick actions when prompt has no keyword', () => {
        const suggestion = suggestDashboardWidgetFromPrompt('just make it nice')
        assert.equal(suggestion.widgetId, 'quickActions')
        assert.equal(suggestion.column, 'left')
    })

    it('applies widget visibility and moves to top', () => {
        const prefs = createDefaultDashboardPreferences()
        const hidden = {
            ...prefs,
            widgets: prefs.widgets.map((item) => item.id === 'teamActivity' ? {...item, visible: false} : item),
        }
        const next = applySuggestedDashboardWidget(hidden, 'teamActivity', 'right')
        const rightIds = visibleWidgetIdsForColumn(next, 'right')
        assert.equal(rightIds[0], 'teamActivity')
    })
})

