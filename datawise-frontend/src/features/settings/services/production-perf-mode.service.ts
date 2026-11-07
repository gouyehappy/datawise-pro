import type {EditorSettings} from '@/features/settings/constants/editor-presets'
import {useEditorSettingsStore} from '@/features/settings/stores/editor-settings'
import {
    type ConnectionEnvSource,
    isProductionPerfActiveForConnection,
    resolveEffectiveCursorLoadedRowsMax,
    resolveEffectiveMaxResultRows,
} from '@/features/settings/services/production-perf-mode.policy'

export {
    PRODUCTION_PERF_CURSOR_MAX,
    PRODUCTION_PERF_MAX_RESULT_ROWS,
    resolveEffectiveCursorLoadedRowsMax,
    resolveEffectiveMaxResultRows,
    isProductionConnectionNode,
} from '@/features/settings/services/production-perf-mode.policy'

export function isProductionPerfModeEnabled(settings?: Pick<EditorSettings, 'productionPerfMode'>): boolean {
    const value = settings?.productionPerfMode ?? useEditorSettingsStore().settings.productionPerfMode
    return value === true
}

export function isProductionPerfActive(
    connectionId: string | undefined,
    findNode: (id: string) => ConnectionEnvSource | null,
    settings?: Pick<EditorSettings, 'productionPerfMode'>,
): boolean {
    return isProductionPerfActiveForConnection(
        connectionId,
        findNode,
        isProductionPerfModeEnabled(settings),
    )
}
