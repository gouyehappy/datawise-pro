import type {TenantAiUsage} from '@/shared/api/types'

/** Display order for known AI metering capabilities (Wave 29–33). */
export const AI_CAPABILITY_ORDER = [
    'ai.chat',
    'ai.sql.generate',
    'ai.analyze',
    'ai.semantic.auto',
    'ai.federated.sql',
    'ai.canvas.rerun',
    'ai.other',
] as const

export type AiCapabilityId = (typeof AI_CAPABILITY_ORDER)[number]

export interface AiCapabilityUsageRow {
    id: string
    calls: number
    /** i18n key under ai.quota.* */
    labelKey: string
}

const LABEL_KEYS: Record<string, string> = {
    'ai.chat': 'ai.quota.capChat',
    'ai.sql.generate': 'ai.quota.capSqlGenerate',
    'ai.analyze': 'ai.quota.capAnalyze',
    'ai.semantic.auto': 'ai.quota.capSemanticAuto',
    'ai.federated.sql': 'ai.quota.capFederatedSql',
    'ai.canvas.rerun': 'ai.quota.capCanvasRerun',
    'ai.other': 'ai.quota.capOther',
}

/** Stable rows for known capabilities + any extra keys from the API. */
export function buildAiCapabilityUsageRows(
    usage: TenantAiUsage | null | undefined,
): AiCapabilityUsageRow[] {
    const byCap = usage?.byCapability ?? {}
    const seen = new Set<string>()
    const rows: AiCapabilityUsageRow[] = []

    for (const id of AI_CAPABILITY_ORDER) {
        const calls = Number(byCap[id] ?? 0)
        if (calls <= 0 && !(id in byCap)) continue
        seen.add(id)
        rows.push({
            id,
            calls: Number.isFinite(calls) ? Math.max(0, calls) : 0,
            labelKey: LABEL_KEYS[id] ?? 'ai.quota.capOther',
        })
    }

    for (const [id, raw] of Object.entries(byCap)) {
        if (seen.has(id)) continue
        const calls = Number(raw ?? 0)
        if (!Number.isFinite(calls) || calls <= 0) continue
        rows.push({
            id,
            calls,
            labelKey: 'ai.quota.capOther',
        })
    }

    return rows
}
