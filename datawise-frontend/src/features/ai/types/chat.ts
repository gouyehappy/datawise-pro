/** SQL 确认中断后待恢复的状态 */
export interface AiSqlConfirmPending {
    sessionId: string
    threadId: string
    checkpointId: string
    sql: string
}
