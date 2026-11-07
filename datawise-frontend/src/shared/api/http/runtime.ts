import type {RuntimeApi} from '@/shared/api/types'
import type {RuntimeOfflineImportResult, RuntimeOverview} from '@/shared/api/datasource.types'
import {getJson, postJson} from '@/shared/api/http/request'
import {API_PATHS} from '@/shared/api/http/paths'

export function createHttpRuntimeApi(): RuntimeApi {
    return {
        overview: async () => getJson<RuntimeOverview>(API_PATHS.runtime),
        jre: async () => getJson<RuntimeOverview['jre']>(API_PATHS.runtimeJre),
        importOffline: async (path: string) =>
            postJson<RuntimeOfflineImportResult>(API_PATHS.runtimeImport, {path}),
    }
}
