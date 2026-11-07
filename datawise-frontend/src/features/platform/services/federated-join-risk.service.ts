import type {FederatedJoinRiskHints} from '@/features/platform/types/platform.types'
import {FEDERATED_DEFAULT_MAX_ROWS, FEDERATED_HARD_MAX_ROWS} from '@/features/platform/services/federated-max-rows.service'

export type FederatedJoinRiskTone = 'info' | 'warning' | 'error'

export interface FederatedJoinRiskPresentation {
    tone: FederatedJoinRiskTone
    /** i18n key under platform.federated.risk.* */
    summaryKey: 'unparseable' | 'elevated' | 'ok'
    params: Record<string, string | number | boolean>
}

/** Map server risk hints to alert tone + i18n key (aligned with truncation / Raise limit copy). */
export function presentFederatedJoinRisk(
    hints: FederatedJoinRiskHints | null | undefined,
    labels?: {equalityJoin: string; nonEqualityJoin: string},
): FederatedJoinRiskPresentation | null {
    if (!hints) return null
    const defaultMaxRows = hints.defaultMaxRows > 0 ? hints.defaultMaxRows : FEDERATED_DEFAULT_MAX_ROWS
    const hardMaxRows = hints.hardMaxRows > 0 ? hints.hardMaxRows : FEDERATED_HARD_MAX_ROWS
    const joinKind = hints.equalityJoin
        ? (labels?.equalityJoin ?? 'equality JOIN')
        : (labels?.nonEqualityJoin ?? 'non-equality / cross-product risk')
    const params = {
        pushed: hints.pushedFilterCount,
        residual: hints.residualFilterCount,
        joinKind,
        joins: hints.joinStepCount,
        defaultMaxRows,
        hardMaxRows,
        parseError: hints.parseError?.trim() || '',
    }

    if (!hints.parseable) {
        return {tone: 'error', summaryKey: 'unparseable', params}
    }
    if (hints.truncationRiskElevated || !hints.equalityJoin || hints.residualFilterCount > 0) {
        return {tone: 'warning', summaryKey: 'elevated', params}
    }
    return {tone: 'info', summaryKey: 'ok', params}
}
