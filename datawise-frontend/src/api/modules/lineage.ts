import {api} from '@/shared/api'
import type {
    GetViewModelLineagePayload,
    LineageGraph,
    LineageImpact,
    ParseLineagePayload,
} from '@/features/lineage/types/lineage.types'

export const lineageApi = {
    getViewModelLineage: (payload: GetViewModelLineagePayload) =>
        api.lineage.getViewModelLineage(payload),

    parse: (payload: ParseLineagePayload) => api.lineage.parse(payload),

    getImpact: (payload: Parameters<typeof api.lineage.getImpact>[0]) =>
        api.lineage.getImpact(payload),
}

export type {LineageGraph, LineageImpact}
