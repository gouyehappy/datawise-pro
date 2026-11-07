import {API_PATHS} from '@/shared/api/http/paths'
import {getJson, postJson} from '@/shared/api/http/request'
import type {
    GetLineageImpactPayload,
    GetViewModelLineagePayload,
    LineageGraph,
    LineageImpact,
    ParseLineagePayload,
} from '@/shared/api/lineage.types'

export function createHttpLineageApi() {
    return {
        getViewModelLineage(payload: GetViewModelLineagePayload): Promise<LineageGraph> {
            const params = new URLSearchParams({
                connectionId: payload.connectionId,
                instanceName: payload.instanceName,
                name: payload.name,
                forceRefresh: payload.forceRefresh ? 'true' : 'false',
            })
            return getJson<LineageGraph>(`${API_PATHS.lineage.viewModels}?${params}`)
        },

        parse(payload: ParseLineagePayload): Promise<LineageGraph> {
            return postJson<LineageGraph>(API_PATHS.lineage.parse, payload)
        },

        getImpact(payload: GetLineageImpactPayload): Promise<LineageImpact> {
            const params = new URLSearchParams({
                connectionId: payload.connectionId,
                instanceName: payload.instanceName,
                name: payload.name,
            })
            return getJson<LineageImpact>(`${API_PATHS.lineage.impact}?${params}`)
        },
    }
}

export type LineageApi = ReturnType<typeof createHttpLineageApi>
