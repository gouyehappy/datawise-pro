import {consumeSseBlocks, parseSseBlock} from '@/shared/utils/sse'
import {ApiError, buildApiUrl, buildSessionHeaders} from '@/shared/api/http/request'
import {API_PATHS} from '@/shared/api/http/paths'
import type {MigrationJobView, TableMigrationResult} from '@/shared/api/types'
import type {
    TableMigrationTableBatchProgressEvent,
    TableMigrationTablePhaseEvent,
    TableMigrationTableResultEvent,
    TableMigrationTableStartEvent,
} from '@/shared/api/http/migration-stream'

export interface MigrationJobStreamHandlers {
    onJobSnapshot?: (view: MigrationJobView) => void
    onTableStart?: (event: TableMigrationTableStartEvent) => void
    onTableResult?: (event: TableMigrationTableResultEvent) => void
    onBatchProgress?: (event: TableMigrationTableBatchProgressEvent) => void
    onTablePhase?: (event: TableMigrationTablePhaseEvent) => void
    onJobPaused?: (view: MigrationJobView) => void
    onJobDone?: (view: MigrationJobView) => void
    onError?: (message: string) => void
}

async function getMigrationJobSse(jobId: string): Promise<Response> {
    let response: Response
    try {
        response = await fetch(buildApiUrl(API_PATHS.migration.jobStream(jobId)), {
            method: 'GET',
            headers: {
                Accept: 'text/event-stream',
                ...buildSessionHeaders(),
            },
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

/** GET SSE：订阅迁移 job 进度，支持运行中重连。 */
export async function streamMigrationJob(
    jobId: string,
    handlers: MigrationJobStreamHandlers,
): Promise<{view: MigrationJobView; results: TableMigrationResult[]}> {
    const response = await getMigrationJobSse(jobId)
    return consumeMigrationJobSseStream(response.body!, handlers)
}

async function consumeMigrationJobSseStream(
    body: ReadableStream<Uint8Array>,
    handlers: MigrationJobStreamHandlers,
): Promise<{view: MigrationJobView; results: TableMigrationResult[]}> {
    let latestView: MigrationJobView | null = null

    await consumeSseBlocks(body, (block) => {
        latestView = dispatchMigrationJobSseBlock(block, handlers, latestView) ?? latestView
    })

    if (!latestView) {
        throw new ApiError('Migration job stream ended without a snapshot')
    }
    const view: MigrationJobView = latestView
    return {view, results: [...(view.results ?? [])]}
}

function dispatchMigrationJobSseBlock(
    block: string,
    handlers: MigrationJobStreamHandlers,
    latestView: MigrationJobView | null,
): MigrationJobView | null {
    const parsed = parseSseBlock(block.trim())
    if (!parsed) return null

    if (parsed.event === 'job_snapshot') {
        const view = JSON.parse(parsed.data) as MigrationJobView
        handlers.onJobSnapshot?.(view)
        return view
    }
    if (parsed.event === 'table_start') {
        handlers.onTableStart?.(JSON.parse(parsed.data) as TableMigrationTableStartEvent)
        return latestView
    }
    if (parsed.event === 'table_result') {
        handlers.onTableResult?.(JSON.parse(parsed.data) as TableMigrationTableResultEvent)
        return latestView
    }
    if (parsed.event === 'batch_progress') {
        handlers.onBatchProgress?.(JSON.parse(parsed.data) as TableMigrationTableBatchProgressEvent)
        return latestView
    }
    if (parsed.event === 'table_phase') {
        handlers.onTablePhase?.(JSON.parse(parsed.data) as TableMigrationTablePhaseEvent)
        return latestView
    }
    if (parsed.event === 'job_paused') {
        const view = JSON.parse(parsed.data) as MigrationJobView
        handlers.onJobPaused?.(view)
        handlers.onJobSnapshot?.(view)
        return view
    }
    if (parsed.event === 'job_done') {
        const view = JSON.parse(parsed.data) as MigrationJobView
        handlers.onJobDone?.(view)
        handlers.onJobSnapshot?.(view)
        return view
    }
    if (parsed.event === 'error') {
        const payload = JSON.parse(parsed.data) as {message?: string}
        handlers.onError?.(payload.message ?? 'Migration failed')
    }
    return latestView
}

/** 测试用：将 SSE 文本编码为 ReadableStream */
export function encodeMigrationJobSseText(text: string): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder()
    return new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode(text))
            controller.close()
        },
    })
}

export async function consumeMigrationJobSseStreamForTest(
    body: ReadableStream<Uint8Array>,
    handlers: MigrationJobStreamHandlers,
): Promise<{view: MigrationJobView; results: TableMigrationResult[]}> {
    return consumeMigrationJobSseStream(body, handlers)
}
