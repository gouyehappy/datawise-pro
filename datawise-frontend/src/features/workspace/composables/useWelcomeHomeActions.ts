import {ref, toValue, type MaybeRefOrGetter} from 'vue'
import {useI18n} from 'vue-i18n'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {useFeaturePermission} from '@/features/auth/composables/useFeaturePermission'
import {FeaturePermission} from '@/features/auth/types/feature-permission.types'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import type {DbType, SavedConsole, SqlLogEntry} from '@/core/types'
import type {
    WelcomeCommonActionId,
    WelcomeConnectionRow,
    WelcomeExploreLinkId,
    WelcomeMainPathId,
    WelcomeWorkflowStepId,
} from '@/features/workspace/services/welcome-main-paths.service'
import {openWelcomeConnectionPrimary} from '@/features/workspace/services/welcome-open-connection-action.service'

export interface WelcomeHistoryItem {
  id: string
  title: string
  subtitle: string
  kind: 'log' | 'console'
  log?: SqlLogEntry
  console?: SavedConsole
}

export type UseWelcomeHomeActionsOptions = {
  hasConnections: MaybeRefOrGetter<boolean>
  canCreateConnection: MaybeRefOrGetter<boolean>
  openImportConnections: () => void
}

/** Welcome 首页导航：建连、打开最近项、路径 / Explore / 次级动作 */
export function useWelcomeHomeActions(options: UseWelcomeHomeActionsOptions) {
  const {t} = useI18n()
  const workspace = useWorkspaceStore()
  const layout = useLayoutStore()
  const entitlement = useEntitlementStore()
  const pluginStore = usePluginStore()
  const {can} = useFeaturePermission()

  const showTypePicker = ref(false)

  function openNewConnection() {
    showTypePicker.value = true
  }

  function onPickDbType(dbType: DbType) {
    showTypePicker.value = false
    workspace.openConnectionForm(dbType)
  }

  async function openRecent(connection: WelcomeConnectionRow) {
    await openWelcomeConnectionPrimary({
      connectionId: connection.id,
      connectionName: connection.label,
      dbType: connection.dbType,
    })
  }

  function openHistory() {
    layout.setModule('database')
    layout.activeShortcutPanel = 'history'
  }

  function openHistoryItem(item: WelcomeHistoryItem) {
    if (item.kind === 'log' && item.log) {
      void workspace.openConsole({
        connectionId: item.log.connectionId,
        sql: item.log.sql,
      })
      return
    }
    if (item.console) {
      void workspace.openConsole({
        connectionName: item.console.connectionName,
        sql: item.console.sql ?? '',
        title: item.console.name,
      })
    }
  }

  /** A1-3: 无连接先引导建连，避免直接撞上 AI paywall */
  function openAiPath() {
    if (!toValue(options.hasConnections)) {
      layout.showWarningToast(t('welcome.aiNeedsConnection'))
      if (toValue(options.canCreateConnection)) openNewConnection()
      return
    }
    if (!entitlement.guardAiNav()) return
    layout.setModule('ai')
  }

  function runPath(id: WelcomeMainPathId) {
    if (id === 'explore') {
      openNewConnection()
      return
    }
    if (id === 'sql') {
      void workspace.openConsole()
      return
    }
    openAiPath()
  }

  function runWorkflowStep(id: WelcomeWorkflowStepId) {
    if (id === 'connect') {
      if (toValue(options.canCreateConnection)) openNewConnection()
      return
    }
    if (id === 'query') {
      if (can(FeaturePermission.WorkbenchTabNew)) void workspace.openConsole()
      return
    }
    if (id === 'analyze') {
      openAiPath()
    }
  }

  function runExploreLink(id: WelcomeExploreLinkId) {
    if (id === 'connectors') {
      pluginStore.openConnectorMarket()
      return
    }
    if (id === 'dashboard') {
      layout.setModule('dashboard')
      return
    }
    if (id === 'team') {
      layout.openTeamModule()
      return
    }
    if (id === 'settings') {
      layout.openSettingsModule('basic')
      return
    }
    if (id === 'ai') {
      openAiPath()
    }
  }

  async function openLocalDataPreviewPicker() {
    const {readDatawiseHost} = await import('@/features/layout/services/desktop-bridge')
    const host = readDatawiseHost()
    if (!host?.fs?.selectFile) {
      layout.showWarningToast(t('welcome.common.localDataNeedsDesktop'))
      return
    }
    // Ext hint for native dialog; unknown tokens still open an all-files picker.
    const path = await host.fs.selectFile('parquet')
    if (!path) return
    const {previewLocalDataFile} = await import('@/features/local-files/services/local-data-preview.service')
    await previewLocalDataFile(path)
  }

  function runCommonAction(id: WelcomeCommonActionId) {
    if (id === 'history') {
      openHistory()
      return
    }
    if (id === 'import') {
      options.openImportConnections()
      return
    }
    if (id === 'localData') {
      void openLocalDataPreviewPicker()
    }
  }

  return {
    showTypePicker,
    openNewConnection,
    onPickDbType,
    openRecent,
    openHistory,
    openHistoryItem,
    openAiPath,
    runPath,
    runWorkflowStep,
    runExploreLink,
    runCommonAction,
  }
}
