import {consumeSseBlocks, encodeSseText, parseSseBlock} from '@/shared/utils/sse'
import {ApiError, buildApiUrl, buildSessionHeaders} from '@/shared/api/http/request'
import {API_PATHS} from '@/shared/api/http/paths'
import type {
    TableMigrationBatchRequest,
    TableMigrationBatchResult,
    TableMigrationResult,
} from '@/shared/api/types'

export interface TableMigrationTableStartEvent {
    tableIndex: number
    tableTotal: number
    tableName: string
}

export interface TableMigrationTableResultEvent {
    tableIndex: number
    tableTotal: number
    result: TableMigrationResult
}

export interface TableMigrationTableBatchProgressEvent {
    tableIndex: number
    tableTotal: number
    tableName: string
    offset: number
    rowsMigrated: number
    batches: number
}

export type TableMigrationTablePhase =
    | 'preparing'
    | 'creating_target'
    | 'counting'
    | 'truncating'
    | 'copying'
    | 'validating'

export interface TableMigrationTablePhaseEvent {
    tableIndex: number
    tableTotal: number
    tableName: string
    phase: TableMigrationTablePhase | string
}

export interface TableMigrationStreamHandlers {
    onTableStart: (event: TableMigrationTableStartEvent) => void
    onTableResult: (event: TableMigrationTableResultEvent) => void
    onBatchProgress?: (event: TableMigrationTableBatchProgressEvent) => void
    onTablePhase?: (event: TableMigrationTablePhaseEvent) => void
    onDone: (result: TableMigrationBatchResult) => void
    onError?: (message: string) => void
}

async function postMigrationSse(request: TableMigrationBatchRequest): Promise<Response> {
    let response: Response
    try {
        response = await fetch(buildApiUrl(API_PATHS.migration.tablesBatchStream), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'text/event-stream',
                ...buildSessionHeaders(),
            },
            body: JSON.stringify(request),
            credentials: 'include',
        })
    } catch {
        throw new ApiError('HTTP API request failed. Ensure the backend is running.')
    }

    if (!response.ok || !response.body) {
        throw new ApiError(`HTTP ${response.status}`)
    }
    return response
}

/** POST SSE：多表迁移逐表进度 + 最终汇总 */
export async function streamMigrationBatch(
    request: TableMigrationBatchRequest,
    handlers: TableMigrationStreamHandlers,
): Promise<TableMigrationBatchResult> {
    const response = await postMigrationSse(request)
    return consumeMigrationSseStream(response.body!, handlers)
}

async function consumeMigrationSseStream(
    body: ReadableStream<Uint8Array>,
    handlers: TableMigrationStreamHandlers,
): Promise<TableMigrationBatchResult> {
    let finalResult: TableMigrationBatchResult | null = null

    await consumeSseBlocks(body, (block) => {
        finalResult = dispatchMigrationSseBlock(block, handlers) ?? finalResult
    })

    if (!finalResult) {
        throw new ApiError('Migration stream ended without a result')
    }
    return finalResult
}

function dispatchMigrationSseBlock(
    block: string,
    handlers: TableMigrationStreamHandlers,
): TableMigrationBatchResult | null {
    const parsed = parseSseBlock(block.trim())
    if (!parsed) return null

    if (parsed.event === 'table_start') {
        handlers.onTableStart(JSON.parse(parsed.data) as TableMigrationTableStartEvent)
        return null
    }
    if (parsed.event === 'table_result') {
        handlers.onTableResult(JSON.parse(parsed.data) as TableMigrationTableResultEvent)
        return null
    }
    if (parsed.event === 'batch_progress') {
        handlers.onBatchProgress?.(JSON.parse(parsed.data) as TableMigrationTableBatchProgressEvent)
        return null
    }
    if (parsed.event === 'table_phase') {
        handlers.onTablePhase?.(JSON.parse(parsed.data) as TableMigrationTablePhaseEvent)
        return null
    }
    if (parsed.event === 'done') {
        const result = JSON.parse(parsed.data) as TableMigrationBatchResult
        handlers.onDone(result)
        return result
    }
    if (parsed.event === 'error') {
        const payload = JSON.parse(parsed.data) as {message?: string}
        handlers.onError?.(payload.message ?? 'Migration failed')
    }
    return null
}

/** 测试用：将 SSE 文本编码为 ReadableStream */
export function encodeMigrationSseText(text: string): ReadableStream<Uint8Array> {
    return encodeSseText(text)
}

export async function consumeMigrationSseStreamForTest(
    body: ReadableStream<Uint8Array>,
    handlers: TableMigrationStreamHandlers,
): Promise<TableMigrationBatchResult> {
    return consumeMigrationSseStream(body, handlers)
}
