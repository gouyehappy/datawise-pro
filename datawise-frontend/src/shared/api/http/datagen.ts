import type {TableRow} from '@/core/types'
import type {
    DatagenApi,
    DatagenPreviewRequest,
    DatagenPreviewResult,
    ExecuteSqlResult,
} from '@/shared/api/types'
import type {
    DatagenPreviewRequestDto,
    DatagenPreviewResultDto,
} from '@/shared/api/generated'
import {postJson} from '@/shared/api/http/request'
import {API_PATHS} from '@/shared/api/http/paths'

function toWireDatagenPreview(request: DatagenPreviewRequest): DatagenPreviewRequestDto {
    return {
        connectionId: request.connectionId,
        database: request.database ?? undefined,
        tableName: request.tableName,
        rowCount: request.rowCount ?? undefined,
        seed: request.seed ?? undefined,
    }
}

function mapDatagenPreview(wire: DatagenPreviewResultDto): DatagenPreviewResult {
    return {
        connectionId: String(wire.connectionId ?? ''),
        database: String(wire.database ?? ''),
        tableName: String(wire.tableName ?? ''),
        rowCount: Number(wire.rowCount ?? 0),
        seed: Number(wire.seed ?? 0),
        previewRows: (wire.previewRows ?? []) as TableRow[],
        insertSql: String(wire.insertSql ?? ''),
    }
}

export function createHttpDatagenApi(): DatagenApi {
    return {
        previewTableDatagen: async (request: DatagenPreviewRequest): Promise<DatagenPreviewResult> =>
            mapDatagenPreview(
                await postJson<DatagenPreviewResultDto>(
                    API_PATHS.datagen.tablePreview,
                    toWireDatagenPreview(request),
                ),
            ),
        executeTableDatagen: async (
            request: DatagenPreviewRequest,
        ): Promise<ExecuteSqlResult> =>
            postJson<ExecuteSqlResult>(
                API_PATHS.datagen.tableExecute,
                toWireDatagenPreview(request),
            ),
    }
}

