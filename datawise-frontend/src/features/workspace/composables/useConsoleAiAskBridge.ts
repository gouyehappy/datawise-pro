import {useLayoutStore} from '@/features/layout/stores/layout'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {normalizeConnectionEnvironment} from '@/features/connection/services/connection-environment.service'
import {
  buildResultAskPrompt,
  buildSelectionInstruction,
  requestAiAsk,
  type AiAskIntent,
} from '@/features/ai/shared/services/ai-ask.service'
import type {AiConversationBinding} from '@/features/ai/types/session'
import {extractTableNamesFromSql} from '@/features/workspace/services/sql-history-knowledge.utils'

export type ConsoleAiAskBridgeDeps = {
  getConnectionId: () => string | undefined
  getDatabase: () => string | undefined
  getConnectionLabel: () => string | undefined
  getDialect: () => string | undefined
  getActiveResultSql: () => string | undefined
}

/**
 * T-AI-2：选区 / 结果集提问桥接到 AI 工作台（同 binding 复用会话）。
 */
export function useConsoleAiAskBridge(deps: ConsoleAiAskBridgeDeps) {
  const layout = useLayoutStore()
  const explorer = useExplorerStore()

  function resolveEditorAskBinding(): AiConversationBinding | undefined {
    const connId = deps.getConnectionId()
    if (!connId) return undefined
    const node = explorer.findNode(connId)
    return {
      connectionId: connId,
      connectionName: deps.getConnectionLabel() || explorer.findNode(connId)?.label || undefined,
      database: deps.getDatabase() || undefined,
      dialect: typeof deps.getDialect() === 'string' ? deps.getDialect() : undefined,
      environment: normalizeConnectionEnvironment(node?.env, node?.envCustom).env || undefined,
      source: 'editor_send',
    }
  }

  function sendSelectionToAi(sql: string, intent: AiAskIntent) {
    const connId = deps.getConnectionId()
    const database = deps.getDatabase()
    const mode = intent === 'fix' ? 'agent' : 'ask'
    layout.setModule('ai')
    void requestAiAsk({
      intent,
      mode,
      prompt: buildSelectionInstruction(intent),
      selectionText: sql,
      binding: resolveEditorAskBinding(),
      focusInput: true,
      scope:
        connId && database
          ? {
            connectionId: connId,
            database,
            tables: extractTableNamesFromSql(sql),
          }
          : undefined,
    })
  }

  /** 结果集提问：带结果提示词 + 选区附件 */
  function askAiWithPrompt(sql: string, prompt: string) {
    const connId = deps.getConnectionId()
    const database = deps.getDatabase()
    layout.setModule('ai')
    void requestAiAsk({
      prompt,
      selectionText: sql,
      intent: 'ask',
      mode: 'ask',
      binding: resolveEditorAskBinding(),
      focusInput: true,
      scope:
        connId && database
          ? {
            connectionId: connId,
            database,
            tables: extractTableNamesFromSql(sql),
          }
          : undefined,
    })
  }

  function onRequestAiAsk() {
    const sql = deps.getActiveResultSql()?.trim()
    if (!sql) return
    askAiWithPrompt(sql, buildResultAskPrompt(sql))
  }

  return {
    resolveEditorAskBinding,
    sendSelectionToAi,
    askAiWithPrompt,
    onRequestAiAsk,
  }
}
