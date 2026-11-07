import type {
    PlatformScheduleDraft,
    ScheduledSqlSource,
} from '@/shared/api/platform.types'

export type {PlatformScheduleDraft, ScheduledSqlSource}

export interface ScheduledSqlPayloadInput {
    source: ScheduledSqlSource
    connectionId: string
    database: string
    sql?: string
    sqlFile?: string
    teamId?: string
    queryId?: string
    maxRows?: number
    digest?: boolean
    digestMaxRows?: number
}

/** Build payload JSON for TYPE_SQL scheduled tasks (inline / workspace file / Query Library). */
export function buildScheduledSqlPayloadJson(input: ScheduledSqlPayloadInput): string {
    const connectionId = input.connectionId.trim()
    const database = input.database.trim()
    if (!connectionId || !database) {
        throw new Error('connectionId and database are required')
    }

    const base: Record<string, unknown> = {
        source: input.source,
        connectionId,
        database,
    }
    if (input.maxRows != null && Number.isFinite(input.maxRows)) {
        base.maxRows = input.maxRows
    }
    if (input.digest) {
        base.digest = true
        if (input.digestMaxRows != null && Number.isFinite(input.digestMaxRows)) {
            base.digestMaxRows = input.digestMaxRows
        }
    }

    switch (input.source) {
        case 'workspace_file': {
            const sqlFile = input.sqlFile?.trim()
            if (!sqlFile) throw new Error('sqlFile is required')
            base.sqlFile = sqlFile
            break
        }
        case 'query_library': {
            const teamId = input.teamId?.trim()
            const queryId = input.queryId?.trim()
            if (!teamId || !queryId) throw new Error('teamId and queryId are required')
            base.teamId = teamId
            base.queryId = queryId
            break
        }
        default: {
            const sql = input.sql?.trim()
            if (!sql) throw new Error('sql is required')
            base.sql = sql
            break
        }
    }

    return JSON.stringify(base)
}

export function parseScheduledSqlPayloadJson(payloadJson?: string | null): Partial<ScheduledSqlPayloadInput> {
    if (!payloadJson?.trim()) return {source: 'inline'}
    try {
        const parsed = JSON.parse(payloadJson) as Record<string, unknown>
        const sqlFile = typeof parsed.sqlFile === 'string' ? parsed.sqlFile : undefined
        const teamId = typeof parsed.teamId === 'string' ? parsed.teamId : undefined
        const queryId = typeof parsed.queryId === 'string' ? parsed.queryId : undefined
        let source = typeof parsed.source === 'string' ? parsed.source as ScheduledSqlSource : undefined
        if (!source) {
            if (sqlFile) source = 'workspace_file'
            else if (teamId && queryId) source = 'query_library'
            else source = 'inline'
        }
        return {
            source,
            connectionId: typeof parsed.connectionId === 'string' ? parsed.connectionId : undefined,
            database: typeof parsed.database === 'string' ? parsed.database : undefined,
            sql: typeof parsed.sql === 'string' ? parsed.sql : undefined,
            sqlFile,
            teamId,
            queryId,
            maxRows: typeof parsed.maxRows === 'number' ? parsed.maxRows : undefined,
            digest: parsed.digest === true,
            digestMaxRows: typeof parsed.digestMaxRows === 'number' ? parsed.digestMaxRows : undefined,
        }
    } catch {
        return {source: 'inline'}
    }
}

export function defaultScheduleNameForSqlFile(fileName: string): string {
    const base = fileName.replace(/\.sql$/i, '').trim() || fileName
    return `Schedule ${base}`
}
