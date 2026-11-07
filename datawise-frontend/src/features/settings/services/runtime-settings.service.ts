import type {
    RuntimeOfflineImportResult,
    RuntimeOverview,
} from '@/features/datasource/types/datasource.types'
import {runtimeApi, datasourcesApi} from '@/api'
import {formatRuntimeBytes, CORE_CONNECTOR_IDS} from '@/features/settings/services/runtime-format.service'

export {formatRuntimeBytes, CORE_CONNECTOR_IDS}

export async function fetchRuntimeOverview(): Promise<RuntimeOverview> {
    return runtimeApi.overview()
}

export async function importRuntimeOfflineZip(path: string): Promise<RuntimeOfflineImportResult> {
    return runtimeApi.importOffline(path)
}

/** Desktop host file picker for offline runtime / driver sidecar zip. */
export async function pickRuntimeOfflineZip(): Promise<string | null> {
    const host = window.datawise
    if (host?.fs?.selectFile) {
        return host.fs.selectFile('zip')
    }
    return null
}

export async function deleteCachedDriver(relativePath: string) {
    return datasourcesApi.deleteDriver(relativePath)
}

export async function deleteCachedDriverBundle(bundleDir: string) {
    return datasourcesApi.deleteDriverBundle(bundleDir)
}

export async function deleteDriverFamily(familyId: string) {
    return datasourcesApi.deleteDriverFamily(familyId)
}

export async function installJdbcDriver(mavenCoordinates: string, driverClass: string) {
    return datasourcesApi.installDriver(mavenCoordinates, driverClass)
}

export async function refreshDriverCatalog() {
    return datasourcesApi.listDrivers()
}
