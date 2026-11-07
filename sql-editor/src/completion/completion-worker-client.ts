import type {SqlCompletionContext} from './context'
import {analyzeSqlCompletionContext} from './context'
import {getCachedSnapshot, schemaFingerprint, setCachedAnalysis} from './analysis-cache'
import type {
    CompletionWorkerPreload,
    CompletionWorkerRequest,
    CompletionWorkerResponse,
} from './completion.worker'
import {workerSchemaPayload} from '@sql-editor/utils/schema-plain'
import {warmCompletionSnapshot, type CompletionSnapshot} from './core/snapshot'
import {preloadCompletionSqlParser} from './parser/parser-hold'

let worker: Worker | null | undefined
let workerFailed = false
let nextRequestId = 0
let latestScheduledId = 0
let rafId = 0
let rejectActiveSnapshot: (() => void) | null = null

type Pending = {
    id: number
    sql: string
    offset: number
    dialect: string
    tables: string[]
    columns: Record<string, { name: string }[]>
    schemaKey: string
    onCtx?: (ctx: SqlCompletionContext) => void
    resolvers: Array<(snapshot: CompletionSnapshot) => void>
}

let pending: Pending | null = null

function sameAnalysisTarget(a: Pending, b: Pending): boolean {
    return (
        a.sql === b.sql &&
        a.offset === b.offset &&
        a.schemaKey === b.schemaKey &&
        a.dialect === b.dialect
    )
}

function getWorker(): Worker | null {
    if (workerFailed) return null
    if (worker !== undefined) return worker
    if (typeof Worker === 'undefined') {
        worker = null
        return null
    }
    try {
        worker = new Worker(new URL('./completion.worker.ts', import.meta.url), {type: 'module'})
        worker.onerror = () => {
            workerFailed = true
            worker?.terminate()
            worker = null
        }
    } catch {
        workerFailed = true
        worker = null
    }
    return worker ?? null
}

function finishJob(
    job: Pending,
    ctx: SqlCompletionContext,
    parserKeywords: string[] | null,
) {
    setCachedAnalysis(job.sql, job.offset, job.schemaKey, ctx)
    const snapshot = warmCompletionSnapshot(job.sql, job.offset, job.schemaKey, ctx, parserKeywords)
    job.onCtx?.(ctx)
    for (const resolve of job.resolvers) resolve(snapshot)
}

function dispatchJob(job: Pending): void {
    latestScheduledId = job.id

    const w = getWorker()
    if (!w) {
        void (async () => {
            const ctx = analyzeSqlCompletionContext(job.sql, job.offset, job.tables, job.columns)
            finishJob(job, ctx, null)
        })()
        return
    }

    const {tables, columns} = workerSchemaPayload(job.tables, job.columns)
    const payload: CompletionWorkerRequest = {
        id: job.id,
        sql: job.sql,
        offset: job.offset,
        lineNumber: 1,
        column: 1,
        dialect: job.dialect,
        tables,
        columns,
    }
    w.onmessage = (event: MessageEvent<CompletionWorkerResponse>) => {
        const {id, ctx, parserKeywords} = event.data
        if (id !== latestScheduledId) return
        finishJob(job, ctx, parserKeywords)
    }
    w.postMessage(payload)
}

function flushPending() {
    rafId = 0
    if (!pending) return
    const job = pending
    pending = null
    dispatchJob(job)
}

function enqueue(job: Pending): void {
    if (pending) {
        if (sameAnalysisTarget(pending, job)) {
            pending.resolvers.push(...job.resolvers)
            if (job.onCtx) pending.onCtx = job.onCtx
            pending.id = job.id
        } else {
            if (rafId) {
                cancelAnimationFrame(rafId)
                rafId = 0
            }
            const prev = pending
            pending = job
            dispatchJob(prev)
        }
    } else {
        pending = job
    }
    if (!rafId) {
        rafId = requestAnimationFrame(flushPending)
    }
}

function supersedeActiveSnapshotWait(): void {
    rejectActiveSnapshot?.()
    rejectActiveSnapshot = null
}

/** Provider：优先读缓存，否则 Worker（rAF 合并）分析 context；关键字来自 keywords-config */
export async function getCompletionSnapshot(
    sql: string,
    offset: number,
    dialect: string,
    tables: string[],
    columns: Record<string, { name: string }[]>,
): Promise<CompletionSnapshot> {
    const schemaKey = schemaFingerprint(tables, columns)
    const cached = getCachedSnapshot(sql, offset, schemaKey)
    if (cached) return cached

    supersedeActiveSnapshotWait()

    return new Promise((resolve, reject) => {
        rejectActiveSnapshot = () => reject(new DOMException('Superseded', 'AbortError'))
        enqueue({
            id: ++nextRequestId,
            sql,
            offset,
            dialect,
            tables,
            columns,
            schemaKey,
            resolvers: [
                (snapshot) => {
                    rejectActiveSnapshot = null
                    resolve(snapshot)
                },
            ],
        })
    })
}

/** HintBar：仅需 context；与 Provider 共用 Worker 并预热 snapshot 缓存 */
export function scheduleSqlCompletionAnalysis(
    sql: string,
    offset: number,
    tables: string[],
    columns: Record<string, { name: string }[]>,
    onResult: (ctx: SqlCompletionContext) => void,
    dialect = 'mysql',
): void {
    const schemaKey = schemaFingerprint(tables, columns)
    enqueue({
        id: ++nextRequestId,
        sql,
        offset,
        dialect,
        tables,
        columns,
        schemaKey,
        onCtx: onResult,
        resolvers: [],
    })
}

/** Worker + 主线程双轨预热 parser */
export function preloadCompletionWorker(dialect = 'mysql'): void {
    preloadCompletionSqlParser(dialect)
    const w = getWorker()
    if (!w) return
    const msg: CompletionWorkerPreload = {type: 'preload', dialect}
    w.postMessage(msg)
}

export function disposeCompletionWorker(): void {
    supersedeActiveSnapshotWait()
    if (rafId) cancelAnimationFrame(rafId)
    rafId = 0
    pending = null
    worker?.terminate()
    worker = undefined
    workerFailed = false
}
