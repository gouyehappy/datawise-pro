import {api} from '@/shared/api'
import type {
    ActiveSessionQuery,
    CancelConsoleSqlRequest,
    KillSessionRequest,
    LockWaitQuery,
    SqlExecuteOptions,
    SqlGenerateFromPromptOptions,
    SqlSessionOptions,
    SqlSessionStatus,
} from '@/shared/api/types'

/** SQL 执行、自然语言生成、会话事务与监控 */
export const sqlApi = {
    execute: (sql: string, options?: SqlExecuteOptions) => api.sql.execute(sql, options),
    fetchCursorPage: (cursorId: string, pageSize?: number) => api.sql.fetchCursorPage(cursorId, pageSize),
    closeCursor: (cursorId: string) => api.sql.closeCursor(cursorId),
    generateFromPrompt: (prompt: string, options?: SqlGenerateFromPromptOptions) =>
        api.sql.generateFromPrompt(prompt, options),
    fetchSessionStatus: (sessionKey: string): Promise<SqlSessionStatus> =>
        api.sql.fetchSessionStatus(sessionKey),
    beginSession: (options: SqlSessionOptions) => api.sql.beginSession(options),
    setSessionAutocommit: (options: SqlSessionOptions & { autocommit: boolean }) =>
        api.sql.setSessionAutocommit(options),
    commitSession: (options: SqlSessionOptions) => api.sql.commitSession(options),
    rollbackSession: (options: SqlSessionOptions) => api.sql.rollbackSession(options),
    closeSession: (sessionKey: string) => api.sql.closeSession(sessionKey),
    fetchActiveSessions: (query: ActiveSessionQuery) => api.sql.fetchActiveSessions(query),
    fetchLockWaits: (query: LockWaitQuery) => api.sql.fetchLockWaits(query),
    killSession: (request: KillSessionRequest) => api.sql.killSession(request),
    cancelExecution: (request: CancelConsoleSqlRequest) => api.sql.cancelExecution(request),
}
