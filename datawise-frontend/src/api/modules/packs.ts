import {api} from '@/shared/api'
import type {EntitlementSnapshot, PackId} from '@/features/pack/types/pack.types'
import {normalizeEntitlementSnapshot} from '@/features/pack/services/pack-entitlement.normalize'
import type {PackAuditEventDto} from '@/shared/api/types'

export {normalizeEntitlementSnapshot} from '@/features/pack/services/pack-entitlement.normalize'

export const packsApi = {
    async fetchEntitlement(): Promise<EntitlementSnapshot> {
        const dto = await api.packs.fetchEntitlement()
        return normalizeEntitlementSnapshot(dto)
    },

    async activateLicense(licenseKey: string): Promise<EntitlementSnapshot> {
        const dto = await api.packs.activateLicense(licenseKey)
        return normalizeEntitlementSnapshot(dto)
    },

    async startTrial(packId: PackId): Promise<EntitlementSnapshot> {
        const dto = await api.packs.startTrial(packId)
        return normalizeEntitlementSnapshot(dto)
    },

    async claimSiteProTrial(): Promise<EntitlementSnapshot> {
        const dto = await api.packs.claimSiteProTrial()
        return normalizeEntitlementSnapshot(dto)
    },

    async installPack(packId: PackId, version?: string): Promise<EntitlementSnapshot> {
        const dto = await api.packs.installPack(packId, version)
        return normalizeEntitlementSnapshot(dto)
    },

    async fetchAudit(limit = 50): Promise<PackAuditEventDto[]> {
        return api.packs.fetchAudit(limit)
    },
}
