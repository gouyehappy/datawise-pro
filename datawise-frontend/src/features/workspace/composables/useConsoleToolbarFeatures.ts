import {computed, type Ref} from 'vue'
import {useFeaturePermission} from '@/features/auth/composables/useFeaturePermission'
import {FeaturePermission} from '@/features/auth/types/feature-permission.types'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import type {WorkspaceTab} from '@/core/types'

export type ConsoleToolbarFeaturesDeps = {
  running: Ref<boolean>
  editorReady: Ref<boolean>
  getTab: () => WorkspaceTab
}

/**
 * Console toolbar plugin / edition / permission feature flags and visibility groups.
 */
export function useConsoleToolbarFeatures(deps: ConsoleToolbarFeaturesDeps) {
  const pluginStore = usePluginStore()
  const layout = useLayoutStore()
  const {can} = useFeaturePermission()

  const sqlFormatEnabled = computed(() => pluginStore.isEnabled('p-sql-format'))
  const isStandardEdition = import.meta.env.VITE_DATAWISE_EDITION === 'standard'
  const consoleAiEnabled = computed(
    () => !isStandardEdition && pluginStore.isEnabled('p-console-ai'),
  )
  const indexSuggestEnabled = computed(
    () => import.meta.env.VITE_DATAWISE_EDITION !== 'standard' && pluginStore.isEnabled('p-ai-index-suggest'),
  )
  const aiSqlFixEnabled = computed(
    () => import.meta.env.VITE_DATAWISE_EDITION !== 'standard' && pluginStore.isEnabled('p-ai-sql-fix'),
  )
  const aiResultSummaryEnabled = computed(
    () =>
      import.meta.env.VITE_DATAWISE_EDITION !== 'standard'
      && pluginStore.isEnabled('p-ai-result-summary')
      && can(FeaturePermission.WorkbenchResultAiSummary),
  )
  const aiExplainEnabled = computed(
    () => import.meta.env.VITE_DATAWISE_EDITION !== 'standard' && pluginStore.isEnabled('p-ai-explain'),
  )
  const dmlGenerateEnabled = computed(() => pluginStore.isSwitchEnabled('p-dml-generate'))
  /**
   * P2-2：AI 是全局入口，控制台里的 SQL / 结果也能直接交给 AI 工作台，
   * 不必让用户先切模块再重新描述一遍上下文。
   */
  const canAskAi = computed(
    () => import.meta.env.VITE_DATAWISE_EDITION !== 'standard' && layout.canAccessNavModule('ai'),
  )
  const explainPlanEnabled = computed(() => pluginStore.isEnabled('p-explain-plan'))
  const crossEnvCompareEnabled = computed(() => pluginStore.isEnabled('p-cross-env-compare'))
  const bookmarksEnabled = computed(() => pluginStore.isEnabled('p-sql-bookmarks'))
  const anyAiFeatureEnabled = computed(() =>
    consoleAiEnabled.value
    || aiSqlFixEnabled.value
    || indexSuggestEnabled.value
    || aiResultSummaryEnabled.value
    || aiExplainEnabled.value,
  )
  const teamCollabEnabled = computed(() => {
    const shared = deps.getTab().teamSharedQuery
    return Boolean(shared?.teamId && shared?.queryId)
  })

  const showToolbarRunGroup = computed(() =>
    can(FeaturePermission.WorkbenchConsoleRun)
    || (explainPlanEnabled.value && can(FeaturePermission.WorkbenchConsoleExplain))
    || can(FeaturePermission.WorkbenchConsoleDangerousSql)
    || (deps.running.value && can(FeaturePermission.WorkbenchConsoleRun)),
  )

  const showToolbarSaveGroup = computed(() =>
    can(FeaturePermission.WorkbenchConsoleSave)
    || can(FeaturePermission.WorkbenchConsoleSaveAs)
    || (bookmarksEnabled.value && can(FeaturePermission.WorkbenchConsoleBookmark))
    || can(FeaturePermission.WorkbenchConsoleViewModel)
    || (sqlFormatEnabled.value && can(FeaturePermission.WorkbenchConsoleFormat))
    || can(FeaturePermission.WorkbenchConsoleFullscreen),
  )

  /** B2-2: 标准版也露出 AI 入口，点开走 stub → Insight/AI 人话门禁，避免侧栏才是唯一路径 */
  const showToolbarAiGroup = computed(() =>
    can(FeaturePermission.WorkbenchConsoleAi)
    && (consoleAiEnabled.value || isStandardEdition),
  )
  const mountConsoleAiLayer = computed(() =>
    deps.editorReady.value && (anyAiFeatureEnabled.value || showToolbarAiGroup.value),
  )

  return {
    sqlFormatEnabled,
    isStandardEdition,
    consoleAiEnabled,
    indexSuggestEnabled,
    aiSqlFixEnabled,
    aiResultSummaryEnabled,
    aiExplainEnabled,
    dmlGenerateEnabled,
    canAskAi,
    explainPlanEnabled,
    crossEnvCompareEnabled,
    bookmarksEnabled,
    anyAiFeatureEnabled,
    teamCollabEnabled,
    showToolbarRunGroup,
    showToolbarSaveGroup,
    showToolbarAiGroup,
    mountConsoleAiLayer,
  }
}
