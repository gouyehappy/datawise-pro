import {
    moveWidget,
    setWidgetVisibility,
    type DashboardPreferences,
    type DashboardWidgetColumn,
    type DashboardWidgetId,
} from '@/features/dashboard/services/dashboard-widget.service'

export interface DashboardWidgetAiSuggestion {
    widgetId: DashboardWidgetId
    column: DashboardWidgetColumn
    reasonKey: string
}

const KEYWORD_RULES: Array<{
    widgetId: DashboardWidgetId
    column: DashboardWidgetColumn
    reasonKey: string
    keywords: string[]
}> = [
    {
        widgetId: 'connectionHealth',
        column: 'left',
        reasonKey: 'connectionHealth',
        keywords: ['connection', 'health', 'availability', 'latency', '连接', '健康', '可用性', '探测'],
    },
    {
        widgetId: 'recentSql',
        column: 'main',
        reasonKey: 'recentSql',
        keywords: ['sql', 'query', 'slow', 'execution', '执行', '查询', '慢查询'],
    },
    {
        widgetId: 'recentAnalysis',
        column: 'main',
        reasonKey: 'analysis',
        keywords: ['analysis', 'insight', 'ai', 'report', '分析', '洞察', '问数', '报告'],
    },
    {
        widgetId: 'teamActivity',
        column: 'right',
        reasonKey: 'team',
        keywords: ['team', 'collaboration', 'review', 'audit', '团队', '协作', '审查'],
    },
    {
        widgetId: 'openTabs',
        column: 'right',
        reasonKey: 'workspace',
        keywords: ['tab', 'workspace', 'focus', '工作区', '标签页', '上下文'],
    },
]

const DEFAULT_SUGGESTION: DashboardWidgetAiSuggestion = {
    widgetId: 'quickActions',
    column: 'left',
    reasonKey: 'default',
}

export function suggestDashboardWidgetFromPrompt(prompt: string): DashboardWidgetAiSuggestion {
    const normalized = prompt.trim().toLowerCase()
    if (!normalized) return DEFAULT_SUGGESTION
    for (const rule of KEYWORD_RULES) {
        if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
            return {
                widgetId: rule.widgetId,
                column: rule.column,
                reasonKey: rule.reasonKey,
            }
        }
    }
    return DEFAULT_SUGGESTION
}

export function applySuggestedDashboardWidget(
    prefs: DashboardPreferences,
    widgetId: DashboardWidgetId,
    column: DashboardWidgetColumn,
): DashboardPreferences {
    const withVisible = setWidgetVisibility(prefs, widgetId, true)
    return moveWidget(withVisible, widgetId, column, 0)
}

