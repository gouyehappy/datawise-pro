import type {Component} from 'vue'
import {
    Braces,
    ChartColumn,
    ChartPie,
    FileCog,
    FileDiff,
    FileSpreadsheet,
    GitCompare,
    Grid3x3,
    LineChart,
    ListVideo,
    Mic,
    ShieldCheck,
    SlidersHorizontal,
    TrendingUp,
    Webhook,
} from 'lucide-vue-next'
import type {DwIconName} from '@/core/icons/registry'

/**
 * PERF-09: Lucide icons only needed after first paint (charts / settings /
 * plugin-dev / schema-compare / local file kinds). Loaded via ensureDeferredDwIcons.
 */
export const DW_ICON_DEFERRED_REGISTRY: Partial<Record<DwIconName, Component>> = {
    'chart-bar': ChartColumn,
    'chart-line': LineChart,
    'chart-pie': ChartPie,
    'settings-system-metrics': LineChart,
    matrix: Grid3x3,
    usage: TrendingUp,
    audit: ShieldCheck,
    hooks: Webhook,
    'settings-basic': SlidersHorizontal,
    'settings-sql-editor': FileCog,
    'tab-schema-compare': GitCompare,
    'explain-plan': ListVideo,
    diff: FileDiff,
    mic: Mic,
    'file-sheet': FileSpreadsheet,
    'file-braces': Braces,
}

export const DW_ICON_DEFERRED_NAMES = Object.keys(DW_ICON_DEFERRED_REGISTRY) as DwIconName[]
