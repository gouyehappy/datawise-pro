import type {EntitlementSnapshot} from '@/features/pack/types/pack.types'
import type {EntitlementSnapshotDto, PackRuntimeStatusDto} from '@/shared/api/types'
import type {PackId, PackAccessState, SuiteId} from '@/features/pack/types/pack.types'
import {PACK_IDS, SUITE_IDS} from '@/features/pack/types/pack.types'

function isPackId(value: string): value is PackId {
    return (PACK_IDS as readonly string[]).includes(value)
}

function isSuiteId(value: string): value is SuiteId {
    return (SUITE_IDS as readonly string[]).includes(value)
}

function normalizePack(entry: PackRuntimeStatusDto): EntitlementSnapshot['packs'][number] | null {
    if (!entry.packId || !isPackId(entry.packId) || !entry.state) return null
    const state = entry.state as PackAccessState
    return {
        packId: entry.packId,
        state,
        trialDaysLeft: entry.trialDaysLeft ?? null,
        expiresAt: entry.expiresAt ?? null,
    }
}

export function normalizeEntitlementSnapshot(dto: EntitlementSnapshotDto): EntitlementSnapshot {
    const packs = (dto.packs ?? [])
        .map(normalizePack)
        .filter((entry): entry is NonNullable<typeof entry> => entry != null)
    const suiteRaw = dto.suiteId
    return {
        mode: dto.mode === 'enforced' ? 'enforced' : 'open',
        packs,
        suiteId: suiteRaw && isSuiteId(suiteRaw) ? suiteRaw : null,
        freeAiCallsRemaining: dto.freeAiCallsRemaining ?? null,
        freeAiCallsDailyLimit: dto.freeAiCallsDailyLimit ?? 3,
        metaDocUsable: dto.metaDocUsable ?? (dto.mode !== 'enforced'),
        watermarkFooter: dto.watermarkFooter ?? null,
        siteProTrialAvailable: dto.siteProTrialAvailable ?? false,
        siteProTrialDays: dto.siteProTrialDays ?? 7,
        heartbeatConfigured: dto.heartbeatConfigured === true,
        heartbeatAt: dto.heartbeatAt ?? null,
    }
}
