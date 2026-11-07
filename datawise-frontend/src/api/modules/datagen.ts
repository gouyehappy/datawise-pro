import {api} from '@/shared/api'
import type {DatagenApi, DatagenPreviewRequest} from '@/shared/api/types'

export const datagenApi: DatagenApi = {
    previewTableDatagen: (request: DatagenPreviewRequest) => api.datagen.previewTableDatagen(request),
    executeTableDatagen: (request: DatagenPreviewRequest) => api.datagen.executeTableDatagen(request),
}

