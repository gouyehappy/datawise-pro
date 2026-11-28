import {ref} from 'vue'
import type {SqlRunOptions} from '@/features/workspace/composables/useSqlEditorActions'

export type ConsoleVisualQueryBridgeDeps = {
  getConnectionId: () => string | undefined
  getDatabase: () => string | undefined
  getSql: () => string
  setSql: (value: string) => void
  setStatus: (message: string) => void
  needConnectionMessage: () => string
  executeSql: (sql: string, options?: SqlRunOptions) => void
  openAiInput: (prompt: string) => void
}

/** Visual Query Builder open / apply / apply-and-run / text-to-sql bridge. */
export function useConsoleVisualQueryBridge(deps: ConsoleVisualQueryBridgeDeps) {
  const visualQueryBuilderOpen = ref(false)

  function openVisualQueryBuilder() {
    const connId = deps.getConnectionId()
    const database = deps.getDatabase()
    if (!connId || !database) {
      deps.setStatus(deps.needConnectionMessage())
      return
    }
    visualQueryBuilderOpen.value = true
  }

  function applyVisualQuerySql(generatedSql: string, mode: 'replace' | 'insert') {
    const next = generatedSql.trim()
    if (!next) return
    if (mode === 'replace') {
      deps.setSql(next)
      return
    }
    const current = deps.getSql().trim()
    deps.setSql(current ? `${current}\n\n${next}` : next)
  }

  function applyAndRunVisualQuerySql(generatedSql: string) {
    const next = generatedSql.trim()
    if (!next) return
    deps.setSql(next)
    deps.executeSql(next, {perfSource: 'vqb'})
  }

  function onVisualQueryTextToSql(prompt: string) {
    const text = prompt.trim()
    if (!text) return
    deps.openAiInput(text)
  }

  return {
    visualQueryBuilderOpen,
    openVisualQueryBuilder,
    applyVisualQuerySql,
    applyAndRunVisualQuerySql,
    onVisualQueryTextToSql,
  }
}
