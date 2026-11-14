import type {
    ExecuteSqlResult,
    KillSessionRequest,
    KillSessionResult,
    SessionKillMode,
    SqlApi,
    SqlSessionStatus,
} from '@/shared/api/types'
import type {
    KillSessionRequestDto,
    KillSessionResultDto,
    SqlSessionStatusDto,
} from '@/shared/api/generated'
import {logPerf, perfNow} from '@/core/utils/perf-log'
import {deleteJson, getJson, postJson} from '@/shared/api/http/request'
import {API_PATHS} from '@/shared/api/http/paths'
import {
    resolveConsoleAiLlmProfile,
    toAiLlmProfilePayload,
} from '@/shared/api/internal/ai'

function mapSqlSessionStatus(wire: SqlSessionStatusDto): SqlSessionStatus {
    return {
        autocommit: Boolean(wire.autocommit),
        pending: Boolean(wire.pending),
        connectionId: wire.connectionId ?? null,
        database: wire.database ?? null,
    }
}

function toWireKillSession(request: KillSessionRequest): KillSessionRequestDto {
    return {
        connectionId: request.connectionId.trim(),
        database: request.database?.trim() || undefined,
        sessionId: request.sessionId.trim(),
        mode: request.mode ?? 'query',
    }
}

function mapKillSessionResult(wire: KillSessionResultDto): KillSessionResult {
    const mode = (wire.mode === 'connection' ? 'connection' : 'query') as SessionKillMode
    return {
        sessionId: String(wire.sessionId ?? ''),
        mode,
        sql: String(wire.sql ?? ''),
        killed: Boolean(wire.killed),
        message: String(wire.message ?? ''),
    }
}

export function createHttpSqlApi(): SqlApi {
    return {
        execute: async (sql, options) => {
            const startedAt = perfNow()
            const operation = options?.cursorId ? 'sql.fetchPage' : 'sql.execute'
            const details = {
                connectionId: options?.connectionId,
                database: options?.database,
                sqlLen: sql?.length ?? 0,
                cursorId: options?.cursorId,
            }
            try {
                const result = await postJson<ExecuteSqlResult>(
                    API_PATHS.sql.execute,
                    {
                        sql,
                        connectionId: options?.connectionId,
                        database: options?.database,
                        maxRows: options?.maxRows,
                        pageSize: options?.pageSize,
                        cursorId: options?.cursorId,
                        sessionKey: options?.sessionKey,
                        perfSource: options?.perfSource,
                    },
                    {silent: true, timeoutMs: 0, signal: options?.signal},
                )
                logPerf(operation, startedAt, {
                    ...details,
                    rowCount: result.rowCount,
                    serverDurationMs: result.durationMs,
                })
                return result
            } catch (error) {
                logPerf(operation, startedAt, {...details, ok: false})
                throw error
            }
        },

        fetchCursorPage: async (cursorId, pageSize) => {
            const startedAt = perfNow()
            try {
                const result = await postJson<ExecuteSqlResult>(
                    API_PATHS.sql.execute,
                    {cursorId, pageSize},
                    {silent: true, timeoutMs: 0},
                )
                logPerf('sql.fetchPage', startedAt, {
                    cursorId,
                    rowCount: result.rowCount,
                    serverDurationMs: result.durationMs,
                })
                return result
            } catch (error) {
                logPerf('sql.fetchPage', startedAt, {cursorId, ok: false})
                throw error
            }
        },

        generateFromPrompt: async (prompt, options) => {
            const profile = resolveConsoleAiLlmProfile(options?.prefs)
            const result = await postJson<{ sql: string }>(API_PATHS.ai.sqlGenerate, {
                prompt,
                connectionId: options?.connectionId,
                database: options?.database,
                llm: toAiLlmProfilePayload(profile),
            })
            return result.sql
        },

        fetchSessionStatus: async (sessionKey) =>
            mapSqlSessionStatus(
                await getJson<SqlSessionStatusDto>(
                    API_PATHS.sql.sessionStatus,
                    {sessionKey},
                    {silent: true},
                ),
            ),

        beginSession: async (options) =>
            mapSqlSessionStatus(
                await postJson<SqlSessionStatusDto>(API_PATHS.sql.sessionBegin, options, {
                    silent: true,
                }),
            ),

        setSessionAutocommit: async (options) =>
            mapSqlSessionStatus(
                await postJson<SqlSessionStatusDto>(API_PATHS.sql.sessionAutocommit, options, {
                    silent: true,
                }),
            ),

        commitSession: async (options) =>
            mapSqlSessionStatus(
                await postJson<SqlSessionStatusDto>(API_PATHS.sql.sessionCommit, options, {
                    silent: true,
                }),
            ),

        rollbackSession: async (options) =>
            mapSqlSessionStatus(
                await postJson<SqlSessionStatusDto>(API_PATHS.sql.sessionRollback, options, {
                    silent: true,
                }),
            ),

        closeSession: (sessionKey) =>
            deleteJson(
                `${API_PATHS.sql.sessionClose}?sessionKey=${encodeURIComponent(sessionKey)}`,
                {silent: true},
            ),

        fetchActiveSessions: async (query) => {
            const params = new URLSearchParams()
            params.set('connectionId', query.connectionId.trim())
            if (query.database?.trim()) params.set('database', query.database.trim())
            return getJson(`${API_PATHS.sql.activeSessions}?${params.toString()}`)
        },

        fetchLockWaits: async (query) => {
            const params = new URLSearchParams()
            params.set('connectionId', query.connectionId.trim())
            if (query.database?.trim()) params.set('database', query.database.trim())
            return getJson(`${API_PATHS.sql.lockWaits}?${params.toString()}`)
        },

        killSession: async (request) =>
            mapKillSessionResult(
                await postJson<KillSessionResultDto>(
                    API_PATHS.sql.killSession,
                    toWireKillSession(request),
                ),
            ),

        cancelExecution: (request) =>
            postJson(API_PATHS.sql.cancelExecution, {
                sessionKey: request.sessionKey.trim(),
                mode: request.mode ?? 'query',
                ...(request.queryId ? {queryId: request.queryId.trim()} : {}),
            }),

        closeCursor: (cursorId) =>
            deleteJson(
                `${API_PATHS.sql.closeCursor}?cursorId=${encodeURIComponent(cursorId.trim())}`,
                {silent: true},
            ),
    }
}
