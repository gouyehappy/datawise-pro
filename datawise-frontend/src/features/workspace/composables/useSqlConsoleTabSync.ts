import {nextTick, onMounted, watch, type Ref} from 'vue'
import type {SqlEditorExpose} from '@datawise/sql-editor'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {ensureSqlEditorPlugin} from '@/features/workspace/services/ensure-sql-editor-plugin'
import type {WorkspaceTab} from '@/core/types'
import type {SqlRunOptions} from '@/features/workspace/composables/useSqlEditorActions'
import {
  CONSOLE_EDITOR_HEIGHT_DEFAULT,
  CONSOLE_EDITOR_HEIGHT_MAX,
  CONSOLE_EDITOR_HEIGHT_MIN,
  CONSOLE_EDITOR_HEIGHT_RATIO,
  CONSOLE_RESULT_MIN_HEIGHT,
} from '@/features/workspace/constants/defaults'

export type SqlConsoleTabSyncDeps = {
  getTab: () => WorkspaceTab
  sql: Ref<string>
  editorRef: Ref<SqlEditorExpose | undefined>
  splitRef: Ref<HTMLElement | undefined>
  editorReady: Ref<boolean>
  editorHeight: {value: number}
  isEditorFullscreen: Ref<boolean>
  running: Ref<boolean>
  resultCount: () => number
  dangerousSqlPending: Ref<boolean>
  disarmDangerousSqlPending: () => void
  expandResultPanel: () => void
  collapseResultPanel: () => void
  executeSql: (executableOverride?: unknown, runOptions?: SqlRunOptions) => void
  openAiInput: () => void
  hasAiInput: () => boolean
  connectionId: Ref<string>
  instanceId: Ref<string | null>
  activeInstanceLabel: () => string | undefined
  markSyncingFromStore: (syncing: boolean) => void
  isSyncingFromStore: () => boolean
}

/** Tab SQL / context watches, editor layout, auto-run / AI prompt hooks, mount bootstrap. */
export function useSqlConsoleTabSync(deps: SqlConsoleTabSyncDeps) {
  const workspace = useWorkspaceStore()
  const layout = useLayoutStore()
  const entitlement = useEntitlementStore()
  const appConfig = useAppConfigStore()

  watch(
    () => deps.getTab().sql,
    (value) => {
      if (value !== undefined && value !== deps.sql.value) {
        deps.markSyncingFromStore(true)
        deps.sql.value = value
        void nextTick(() => {
          deps.markSyncingFromStore(false)
        })
      }
    },
  )

  watch(deps.isEditorFullscreen, async () => {
    await nextTick()
    deps.editorRef.value?.layout()
  })

  /** Sticky shell keeps this pane mounted while hidden; relayout Monaco when it becomes active again. */
  watch(
    () => workspace.activeTabId === deps.getTab().id,
    (active) => {
      if (!active) return
      void nextTick(() => {
        deps.editorRef.value?.layout()
      })
    },
  )

  watch(
    () => workspace.tabActivateRefreshSeq[deps.getTab().id] ?? 0,
    (seq, prev) => {
      if (!seq || seq === prev) return
      void nextTick(() => {
        deps.editorRef.value?.layout()
      })
    },
  )

  watch(deps.sql, (value) => {
    if (deps.isSyncingFromStore()) return
    const tab = deps.getTab()
    if (value === tab.sql) return
    workspace.updateTabSql(tab.id, value)
    if (deps.dangerousSqlPending.value) {
      deps.disarmDangerousSqlPending()
    }
  })

  watch(deps.running, (isRunning) => {
    if (isRunning) deps.expandResultPanel()
  })

  watch(
    () => workspace.consoleAutoRunRequest,
    (req) => {
      if (!req || req.tabId !== deps.getTab().id) return
      workspace.clearConsoleAutoRun()
      void nextTick(() => {
        deps.executeSql(undefined, {perfSource: 'context-menu'})
      })
    },
  )

  watch(
    () => workspace.consoleAiPromptRequest,
    (req) => {
      if (!req || req.tabId !== deps.getTab().id) return
      workspace.clearConsoleAiPrompt()
      void nextTick(() => {
        if (deps.hasAiInput()) {
          deps.openAiInput()
          return
        }
        // 无控制台 AI 层时回退到完整 Agent（分析模式）
        if (!entitlement.guardAiNav()) return
        layout.setModule('ai')
      })
    },
  )

  watch(
    () => deps.resultCount(),
    (count, prev) => {
      if (count > 0 && count !== prev) {
        deps.expandResultPanel()
        return
      }
      // 结果清空且未在执行 → 收到底部（叉掉结果 / 新开工作台）
      if (count === 0 && !deps.running.value) {
        deps.collapseResultPanel()
      }
    },
  )

  watch([deps.connectionId, deps.instanceId], ([conn, inst]) => {
    const tab = deps.getTab()
    const database = deps.activeInstanceLabel() ?? tab.database
    if (
      conn === (tab.connectionId ?? '')
      && (inst ?? null) === (tab.instanceId ?? null)
      && database === tab.database
    ) {
      return
    }
    workspace.updateTabContext(tab.id, {
      connectionId: conn,
      instanceId: inst,
      database,
    })
  }, {flush: 'post'})

  function clampEditorHeight(value: number) {
    const splitEl = deps.splitRef.value
    const maxByPane = splitEl
      ? Math.max(CONSOLE_EDITOR_HEIGHT_MIN, splitEl.clientHeight - CONSOLE_RESULT_MIN_HEIGHT - 4)
      : CONSOLE_EDITOR_HEIGHT_MAX
    const max = Math.min(CONSOLE_EDITOR_HEIGHT_MAX, maxByPane)
    return Math.min(max, Math.max(CONSOLE_EDITOR_HEIGHT_MIN, value))
  }

  onMounted(async () => {
    layout.setModule('database')
    // 打开/切回工作台：仅当本 Tab 有结果或正在查询时展开
    if (deps.running.value || deps.resultCount() > 0) {
      deps.expandResultPanel()
    } else {
      deps.collapseResultPanel()
    }
    await ensureSqlEditorPlugin()
    if (!deps.splitRef.value) {
      requestAnimationFrame(() => {
        deps.editorReady.value = true
      })
      return
    }
    if (appConfig.consoleEditorHeight === CONSOLE_EDITOR_HEIGHT_DEFAULT) {
      deps.editorHeight.value = clampEditorHeight(
        Math.round(deps.splitRef.value.clientHeight * CONSOLE_EDITOR_HEIGHT_RATIO),
      )
    }
    requestAnimationFrame(() => {
      deps.editorReady.value = true
    })
  })

  return {clampEditorHeight}
}
