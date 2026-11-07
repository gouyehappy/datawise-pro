import type {PacksApi} from '@/shared/api/types'
import type {
    ActivateLicenseRequest,
    EntitlementSnapshotDto,
    InstallDpkRequest,
    InstallPackRequest,
    PackAuditEventDto,
    StartTrialRequest,
} from '@/shared/api/generated'
import {deleteJson, getJson, postJson} from '@/shared/api/http/request'
import {API_PATHS} from '@/shared/api/http/paths'

/**
 * Packs HTTP client — request/response types from OpenAPI (`shared/api/generated`).
 * Keep getJson/postJson wrappers; do not hand-write parallel DTOs for this domain.
 */
export function createHttpPacksApi(): PacksApi {
    return {
        fetchEntitlement: () =>
            getJson<EntitlementSnapshotDto>(API_PATHS.packs.entitlement, undefined, {silent: true}),
        fetchCatalog: () =>
            getJson<EntitlementSnapshotDto>(API_PATHS.packs.catalog, undefined, {silent: true}),
        activateLicense: (licenseKey) => {
            const body: ActivateLicenseRequest = {licenseKey}
            return postJson<EntitlementSnapshotDto>(API_PATHS.packs.activate, body)
        },
        startTrial: (packId) => {
            const body: StartTrialRequest = {packId}
            return postJson<EntitlementSnapshotDto>(API_PATHS.packs.trial, body)
        },
        claimSiteProTrial: () =>
            postJson<EntitlementSnapshotDto>(API_PATHS.packs.siteProTrial, {}),
        installPack: (packId, version) => {
            const body: InstallPackRequest = {packId, version: version ?? '1.0.0'}
            return postJson<EntitlementSnapshotDto>(API_PATHS.packs.install, body)
        },
        installDpk: (path) => {
            const body: InstallDpkRequest = {path}
            return postJson<EntitlementSnapshotDto>(API_PATHS.packs.installDpk, body)
        },
        uninstallPack: (packId) =>
            deleteJson<EntitlementSnapshotDto>(API_PATHS.packs.uninstall(packId)),
        fetchAudit: (limit = 50) =>
            getJson<PackAuditEventDto[]>(API_PATHS.packs.audit, {limit: String(limit)}),
    }
}
