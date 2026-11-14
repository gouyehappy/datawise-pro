<!--
  欢迎 Tab — A1: 零连接单主 CTA；有连接时「继续」优先，主路径次级；Explore 默认收起
-->
<script setup lang="ts">
import {computed, onMounted, ref, shallowRef, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {useFeaturePermission} from '@/features/auth/composables/useFeaturePermission'
import {FeaturePermission} from '@/features/auth/types/feature-permission.types'
import {
    canImportExplorerConnections,
    canOpenConnectionCatalogForm,
} from '@/features/auth/services/feature-permission.service'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {useDatasourceCatalogStore} from '@/features/datasource/stores/datasource-catalog'
import {useShortcutPanelStore} from '@/features/layout/stores/shortcut-panel-store'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import {formatShortcutLabel} from '@/features/layout/composables/useAppShortcutListener'
import AppBrandLogo from '@/features/layout/components/AppBrandLogo.vue'
import {DwButton} from '@/core/components'
import {DwIcon} from '@/core/icons'
import DbTypeContextPanel from '@/features/explorer/components/DbTypeContextPanel.vue'
import ConnectionEnvBadge from '@/features/explorer/components/ConnectionEnvBadge.vue'
import ImportConnectionDialog from '@/features/explorer/components/ImportConnectionDialog.vue'
import ThirdPartyConnectionImportDialog from '@/features/explorer/components/ThirdPartyConnectionImportDialog.vue'
import type {DbType, SavedConsole, SqlLogEntry} from '@/core/types'
import {
    pickRecentSavedConsoles,
    pickRecentSqlLogs,
} from '@/features/dashboard/services/dashboard-summary.service'
import {
    profileImportConnectionCount,
} from '@/features/explorer/services/import-connection-file.service'
import {planConnectionImportFile} from '@/features/explorer/services/plan-connection-import-file'
import {
    draftsToConnectionConfigs,
    THIRD_PARTY_IMPORT_ACCEPT,
    type ThirdPartyImportParseResult,
} from '@/features/explorer/services/third-party-connection-import'
import {resolveConnectionCatalogErrorMessage} from '@/features/connection/services/connection-catalog.service'
import {
    importProfilePackage,
    preflightProfilePackage,
} from '@/features/settings/services/config-portability.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {
    collectWelcomeConnections,
    collectWelcomeNewestConnections,
    countWelcomeConnected,
    countWelcomeDbTypes,
    filterWelcomeCommonActions,
    filterWelcomeExploreLinks,
    filterWelcomeMainPaths,
    leadCopyKey,
    preferredWelcomePath,
    summarizeSqlPreview,
    WELCOME_SHORTCUT_HINTS,
    WELCOME_WORKFLOW_STEPS,
    type WelcomeCommonActionId,
    type WelcomeConnectionRow,
    type WelcomeExploreLinkId,
    type WelcomeMainPathId,
    type WelcomeWorkflowStepId,
} from '@/features/workspace/services/welcome-main-paths.service'
import {
    readAddedConnectionIds,
    readRecentConnectionIds,
} from '@/features/workspace/services/welcome-recent-connections.service'
import {formatWelcomeConnectionSubtitle} from '@/features/workspace/services/welcome-connection-subtitle.service'
import {fetchConnectionConfig} from '@/shared/config/connections-catalog.service'
import {openWelcomeConnectionPrimary} from '@/features/workspace/services/welcome-open-connection-action.service'
import TreeNodeIcon from '@/features/explorer/components/TreeNodeIcon.vue'

const {t} = useI18n()
const workspace = useWorkspaceStore()
const explorer = useExplorerStore()
const layout = useLayoutStore()
const appConfig = useAppConfigStore()
const entitlement = useEntitlementStore()
const catalog = useDatasourceCatalogStore()
const auth = useAuthStore()
const shortcutPanel = useShortcutPanelStore()
const pluginStore = usePluginStore()
const {can} = useFeaturePermission()

const canCreateConnection = computed(() => canOpenConnectionCatalogForm(auth.isGuest))
const canImport = computed(() => canImportExplorerConnections(auth.isGuest))

/** 进入首页时冻结排序；点击打开只后台 touch，不即时重排 */
const recentIdsSnapshot = shallowRef<string[]>(readRecentConnectionIds())
const addedIdsSnapshot = shallowRef<string[]>(readAddedConnectionIds())

const recentUsedConnections = computed(() =>
    collectWelcomeConnections(explorer.tree, 6, recentIdsSnapshot.value),
)
const newestAddedConnections = computed(() =>
    collectWelcomeNewestConnections(explorer.tree, 6, addedIdsSnapshot.value),
)
const connectionRows = computed(() =>
    [
      {
        key: 'recent',
        titleKey: 'welcome.recentUsed',
        items: recentUsedConnections.value,
      },
      {
        key: 'added',
        titleKey: 'welcome.newestAdded',
        items: newestAddedConnections.value,
      },
    ].filter((row) => row.items.length > 0),
)
const hasRecents = computed(() => connectionRows.value.length > 0)
const hasConnections = computed(() => explorer.connectionCount > 0)
const leadKey = computed(() => leadCopyKey(hasConnections.value || hasRecents.value))
/** A1-4: Explore / 次级能力默认收起 */
const moreOpen = ref(false)

/** connectionId → 可读地址副标题（host:port / URL），异步填充 */
const subtitleByConnectionId = shallowRef<Record<string, string>>({})

const visibleConnectionIds = computed(() => {
  const ids = new Set<string>()
  for (const row of connectionRows.value) {
    for (const item of row.items) ids.add(item.id)
  }
  return [...ids]
})

watch(
    visibleConnectionIds,
    (ids) => {
      void loadConnectionSubtitles(ids)
    },
    {immediate: true},
)

async function loadConnectionSubtitles(ids: readonly string[]) {
  const pending = ids.filter((id) => !(id in subtitleByConnectionId.value))
  if (!pending.length) return
  const entries = await Promise.all(
      pending.map(async (id) => {
        try {
          const config = await fetchConnectionConfig(id)
          const item = connectionRows.value
              .flatMap((row) => row.items)
              .find((row) => row.id === id)
          return [id, formatWelcomeConnectionSubtitle(config, item?.dbType)] as const
        } catch {
          return [id, ''] as const
        }
      }),
  )
  const next = {...subtitleByConnectionId.value}
  for (const [id, subtitle] of entries) next[id] = subtitle
  subtitleByConnectionId.value = next
}

function connectionSubtitle(item: WelcomeConnectionRow): string {
  return subtitleByConnectionId.value[item.id] || ''
}

function isConnectionConnected(connectionId: string): boolean {
  return explorer.pooledConnectionIds.has(connectionId)
}

const stats = computed(() => [
  {key: 'connections', label: t('welcome.stats.connections'), value: explorer.connectionCount},
  {key: 'connected', label: t('welcome.stats.connected'), value: countWelcomeConnected(explorer.pooledConnectionIds)},
  {key: 'dbTypes', label: t('welcome.stats.dbTypes'), value: countWelcomeDbTypes(explorer.tree)},
])

const mainPaths = computed(() =>
    filterWelcomeMainPaths({
      canCreateConnection: canCreateConnection.value,
      canNewConsole: can(FeaturePermission.WorkbenchTabNew),
      canAi: can(FeaturePermission.NavAi),
      workbenchMode: appConfig.workbenchMode,
    }),
)

const preferredPath = computed(() =>
    preferredWelcomePath(mainPaths.value, hasConnections.value || hasRecents.value),
)

/** 有连接时展示的次级路径（零连接首屏不抢主 CTA） */
const secondaryPaths = computed(() =>
    hasConnections.value ? mainPaths.value : [],
)

const secondaryActions = computed(() =>
    filterWelcomeCommonActions({
      canCreateConnection: false,
      canNewConsole: false,
      canHistory: can(FeaturePermission.ShortcutHistory),
      canImport: canImport.value,
      canAi: false,
      workbenchMode: appConfig.workbenchMode,
    }),
)

const exploreLinks = computed(() =>
    filterWelcomeExploreLinks({
      canConnectors: layout.canAccessNavModule('connectorMarket'),
      canDashboard: layout.canAccessNavModule('dashboard'),
      canTeam: layout.canAccessNavModule('team'),
      canSettings: can(FeaturePermission.NavSettings),
      canAi: can(FeaturePermission.NavAi),
      workbenchMode: appConfig.workbenchMode,
    }),
)

const shortcutHints = computed(() =>
    WELCOME_SHORTCUT_HINTS
        .flatMap((item) => {
          const keys = formatShortcutLabel(item.actionId)
          if (!keys) return []
          return [{id: item.actionId, keys, label: t(item.labelKey)}]
        })
        .slice(0, 4),
)

interface WelcomeHistoryItem {
  id: string
  title: string
  subtitle: string
  kind: 'log' | 'console'
  log?: SqlLogEntry
  console?: SavedConsole
}

const historyItems = computed<WelcomeHistoryItem[]>(() => {
  const logs = pickRecentSqlLogs(shortcutPanel.sqlLogs, 8)
  if (logs.length) {
    return logs.map((log) => ({
      id: log.id,
      kind: 'log' as const,
      title: summarizeSqlPreview(log.sql, 48),
      subtitle: [
        log.database,
        log.connectionId ? explorer.findNode(log.connectionId)?.label : undefined,
        log.duration,
      ].filter(Boolean).join(' · '),
      log,
    }))
  }
  return pickRecentSavedConsoles(shortcutPanel.savedConsoles, 8).map((item) => ({
    id: item.id,
    kind: 'console' as const,
    title: item.name,
    subtitle: item.connectionName,
    console: item,
  }))
})

onMounted(() => {
  recentIdsSnapshot.value = readRecentConnectionIds()
  addedIdsSnapshot.value = readAddedConnectionIds()
  void catalog.ensureLoaded().catch(() => undefined)
  if (!shortcutPanel.ready) {
    void shortcutPanel.load().catch(() => undefined)
  }
})

const showTypePicker = ref(false)
const showImportDialog = ref(false)
const importFile = ref<File | null>(null)
const importBusy = ref(false)
const showThirdPartyImportDialog = ref(false)
const thirdPartyParse = shallowRef<ThirdPartyImportParseResult | null>(null)
const thirdPartyFileName = ref('')
const thirdPartyBusy = ref(false)

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

function openImportConnections() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = THIRD_PARTY_IMPORT_ACCEPT
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    void handleImportFile(file)
  }
  input.click()
}

async function handleImportFile(file: File) {
  try {
    const plan = await planConnectionImportFile(file)
    if (plan.kind === 'dwprofile') {
      importFile.value = plan.file
      showImportDialog.value = true
      return
    }
    if (plan.kind === 'third-party') {
      thirdPartyParse.value = plan.parse
      thirdPartyFileName.value = plan.fileName
      showThirdPartyImportDialog.value = true
      return
    }
    const count = await explorer.importConnections(plan.connections)
    await explorer.refreshTree()
    layout.notifyQuiet({
      category: 'workspace',
      titleKey: 'importDone',
      bodyKey: 'importDone',
      params: {detail: t('explorer.importSuccess', {count})},
    })
  } catch (error) {
    layout.showErrorToast(
        resolveConnectionCatalogErrorMessage(error, t, 'save')
        || t('explorer.importFailed'),
    )
  }
}

function onImportDialogOpenChange(open: boolean) {
  showImportDialog.value = open
  if (!open && !importBusy.value) {
    importFile.value = null
  }
}

function onThirdPartyImportOpenChange(open: boolean) {
  showThirdPartyImportDialog.value = open
  if (!open && !thirdPartyBusy.value) {
    thirdPartyParse.value = null
    thirdPartyFileName.value = ''
  }
}

async function confirmThirdPartyImport() {
  const parse = thirdPartyParse.value
  if (!parse?.drafts.length) {
    layout.showErrorToast(t('explorer.thirdPartyImport.empty'))
    return
  }
  thirdPartyBusy.value = true
  try {
    const configs = draftsToConnectionConfigs(parse.drafts)
    const count = await explorer.importConnections(configs)
    await explorer.refreshTree()
    showThirdPartyImportDialog.value = false
    thirdPartyParse.value = null
    thirdPartyFileName.value = ''
    layout.notifyQuiet({
      category: 'workspace',
      titleKey: 'importDone',
      bodyKey: 'importDone',
      params: {detail: t('explorer.importSuccess', {count})},
    })
  } catch (error) {
    layout.showErrorToast(
        resolveConnectionCatalogErrorMessage(error, t, 'save')
        || t('explorer.importFailed'),
    )
  } finally {
    thirdPartyBusy.value = false
  }
}

async function confirmImportProfilePackage(payload: {passphrase: string}) {
  const file = importFile.value
  if (!file) {
    layout.showErrorToast(t('explorer.importFailed'))
    return
  }
  importBusy.value = true
  try {
    const preflight = await preflightProfilePackage(file, payload.passphrase)
    if (!preflight.passphraseOk) {
      layout.showErrorToast(t('settings.configPortability.passphraseIncorrect'))
      return
    }
    if (!preflight.schemaCompatible) {
      layout.showErrorToast(t('settings.configPortability.schemaUnsupported'))
      return
    }
    const result = await importProfilePackage(file, payload.passphrase, {
      connections: true,
      app: false,
      snippets: false,
      aiWorkspace: false,
      projects: false,
      savedConsoles: false,
      sqlHistory: false,
      projectFileConflict: 'preferImported',
    })
    await explorer.refreshTree()
    const count = profileImportConnectionCount(result.counts)
    showImportDialog.value = false
    importFile.value = null
    if (count <= 0) {
      layout.showWarningToast(t('explorer.importConnectionEmpty'))
      return
    }
    layout.notifyQuiet({
      category: 'workspace',
      titleKey: 'importDone',
      bodyKey: 'importDone',
      params: {detail: t('explorer.importSuccess', {count})},
    })
  } catch (error) {
    layout.showErrorToast(
        resolveCaughtApiErrorMessage(error, t, 'explorer.importFailed'),
    )
  } finally {
    importBusy.value = false
  }
}

/** A1-3: 无连接先引导建连，避免直接撞上 AI paywall */
function openAiPath() {
  if (!hasConnections.value) {
    layout.showWarningToast(t('welcome.aiNeedsConnection'))
    if (canCreateConnection.value) openNewConnection()
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
    if (canCreateConnection.value) openNewConnection()
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
    openImportConnections()
    return
  }
  if (id === 'localData') {
    void openLocalDataPreviewPicker()
  }
}

</script>

<template>
  <div
      class="welcome dw-workbench-page"
      :class="{'welcome--picker': showTypePicker}"
      data-wb-recipe="wb-extension"
  >
    <div class="welcome__atmosphere" aria-hidden="true">
      <span class="welcome__beam welcome__beam--a"/>
      <span class="welcome__beam welcome__beam--b"/>
      <span class="welcome__grid"/>
    </div>

    <div v-if="showTypePicker" class="welcome-stage welcome-stage--picker">
      <div class="welcome-picker">
        <div class="welcome-picker__bar">
          <span>{{ t('explorer.pickDbType') }}</span>
          <button type="button" @click="showTypePicker = false">{{ t('common.cancel') }}</button>
        </div>
        <DbTypeContextPanel @select="onPickDbType"/>
      </div>
    </div>

    <div v-else class="welcome-stage" :class="{'welcome-stage--empty': !hasConnections}">
      <header class="welcome-hero">
        <div class="welcome-hero__top">
          <div class="welcome-hero__brand">
            <AppBrandLogo size="lg" class="welcome-hero__logo"/>
            <div class="welcome-hero__titles">
              <h1 class="welcome-hero__title">{{ t('welcome.brand') }}</h1>
              <p class="welcome-hero__kicker">
                {{ hasConnections ? t('welcome.continueWork') : t('welcome.gettingStarted') }}
              </p>
            </div>
          </div>
          <ul v-if="hasConnections" class="welcome-stats" aria-label="workspace stats">
            <li v-for="item in stats" :key="item.key">
              <b>{{ item.value }}</b>
              <span>{{ item.label }}</span>
            </li>
          </ul>
        </div>
        <p class="welcome-hero__lead">{{ t(leadKey) }}</p>

        <!-- A1-1: 零连接 — 单一主 CTA -->
        <div v-if="!hasConnections && canCreateConnection" class="welcome-primary">
          <DwButton variant="primary" class="welcome-primary__btn" @click="openNewConnection">
            {{ t('welcome.newConnection') }}
          </DwButton>
          <p class="welcome-primary__hint">{{ t('welcome.primaryCtaHint') }}</p>
        </div>
        <div v-else-if="!hasConnections" class="welcome-primary">
          <p class="welcome-primary__hint">{{ t('welcome.emptyHint') }}</p>
        </div>

        <!-- A1-2: 有连接 — 「继续」主角：最近连接 -->
        <div v-else-if="hasRecents" class="welcome-continue" :aria-label="t('welcome.continueWork')">
          <div class="welcome-conn-rows">
            <section
                v-for="row in connectionRows"
                :key="row.key"
                class="welcome-conn-row"
                :aria-label="t(row.titleKey)"
            >
              <div class="welcome-pulse__head">
                <h2>{{ t(row.titleKey) }}</h2>
              </div>
              <ul class="welcome-tiles">
                <li v-for="item in row.items" :key="`${row.key}-${item.id}`">
                  <button
                      type="button"
                      class="welcome-tile"
                      :class="{'is-connected': isConnectionConnected(item.id)}"
                      @click="openRecent(item)"
                  >
                    <span class="welcome-tile__icon" aria-hidden="true">
                      <TreeNodeIcon
                          type="connection"
                          :db-type="item.dbType"
                          :plugin-id="item.pluginId"
                      />
                      <i
                          v-if="isConnectionConnected(item.id)"
                          class="welcome-tile__dot"
                          :title="t('welcome.stats.connected')"
                      />
                    </span>
                    <span class="welcome-tile__copy">
                      <strong>
                        <span class="welcome-tile__name">{{ item.label }}</span>
                        <ConnectionEnvBadge v-if="item.env" :env="item.env"/>
                      </strong>
                      <em v-if="connectionSubtitle(item)" class="welcome-tile__meta">
                        {{ connectionSubtitle(item) }}
                      </em>
                    </span>
                  </button>
                </li>
              </ul>
            </section>
          </div>
        </div>

        <!-- A1-2: 主路径降为次级（仅有连接时） -->
        <div
            v-if="secondaryPaths.length"
            class="welcome-paths welcome-paths--secondary"
            role="list"
            :aria-label="t('welcome.paths.title')"
        >
          <button
              v-for="(path, index) in secondaryPaths"
              :key="path.id"
              type="button"
              class="welcome-path"
              :class="{ 'is-preferred': path.id === preferredPath }"
              :style="{ '--welcome-stagger': String(index) }"
              role="listitem"
              @click="runPath(path.id)"
          >
            <span class="welcome-path__icon" aria-hidden="true">
              <DwIcon :name="path.icon" size="md" :stroke-width="1.55"/>
            </span>
            <span class="welcome-path__copy">
              <strong>{{ t(path.titleKey) }}</strong>
              <em>{{ t(path.descKey) }}</em>
            </span>
            <span class="welcome-path__go" aria-hidden="true">
              <DwIcon name="chevron-right" size="sm" :stroke-width="1.8"/>
            </span>
          </button>
        </div>
      </header>

      <div class="welcome-body">
        <section
            v-if="hasConnections"
            class="welcome-pulse"
            aria-label="workspace pulse"
        >
          <div class="welcome-pulse__main welcome-pulse__main--history-only">
            <div class="welcome-pulse__rail welcome-pulse__rail--history">
              <div class="welcome-pulse__head">
                <h2>{{ t('welcome.historyQueries') }}</h2>
              </div>
              <ul v-if="historyItems.length" class="welcome-sql">
                <li v-for="item in historyItems" :key="item.id">
                  <button type="button" @click="openHistoryItem(item)">
                    <code>{{ item.title }}</code>
                    <span>{{ item.subtitle }}</span>
                  </button>
                </li>
              </ul>
              <p v-else class="welcome-empty-line">{{ t('welcome.historyEmpty') }}</p>
            </div>
          </div>
        </section>

        <!-- 零连接：上手步骤默认折叠 -->
        <details v-if="!hasConnections" class="welcome-fold">
          <summary>{{ t('welcome.workflow.title') }}</summary>
          <ol class="welcome-steps welcome-steps--fold" :aria-label="t('welcome.workflow.title')">
            <li v-for="(step, index) in WELCOME_WORKFLOW_STEPS" :key="step.id">
              <button type="button" @click="runWorkflowStep(step.id)">
                <b aria-hidden="true">{{ index + 1 }}</b>
                <span class="welcome-steps__body">
                  <strong>
                    <DwIcon :name="step.icon" size="xs" :stroke-width="1.6"/>
                    {{ t(step.titleKey) }}
                  </strong>
                  <em>{{ t(step.descKey) }}</em>
                </span>
              </button>
            </li>
          </ol>
        </details>

        <!-- A1-4: Explore / 快捷键默认收起 -->
        <details
            v-if="shortcutHints.length || exploreLinks.length"
            class="welcome-fold"
            :open="moreOpen"
            @toggle="moreOpen = ($event.target as HTMLDetailsElement).open"
        >
          <summary>{{ t('welcome.explore.title') }}</summary>
          <div class="welcome-strip welcome-strip--fold">
            <ul v-if="shortcutHints.length" class="welcome-kbd" :aria-label="t('welcome.shortcutsHint')">
              <li v-for="item in shortcutHints" :key="item.id">
                <kbd>{{ item.keys }}</kbd>
                <span>{{ item.label }}</span>
              </li>
            </ul>
            <ul v-if="exploreLinks.length" class="welcome-chips" :aria-label="t('welcome.capabilities')">
              <li v-for="link in exploreLinks" :key="link.id">
                <button type="button" @click="runExploreLink(link.id)">
                  <DwIcon :name="link.icon" size="sm" :stroke-width="1.6"/>
                  {{ t(link.titleKey) }}
                </button>
              </li>
            </ul>
          </div>
        </details>
      </div>

      <footer class="welcome-foot">
        <template v-if="secondaryActions.length">
          <span class="welcome-foot__label">{{ t('welcome.secondaryActions') }}</span>
          <div class="welcome-foot__actions">
            <button
                v-for="action in secondaryActions"
                :key="action.id"
                type="button"
                @click="runCommonAction(action.id)"
            >
              <DwIcon :name="action.icon" size="sm" :stroke-width="1.7"/>
              {{ t(action.titleKey) }}
            </button>
          </div>
        </template>
        <p class="welcome-foot__hint">
          <DwIcon name="file" size="xs" :stroke-width="1.7"/>
          {{ t('welcome.actions.dropHint') }}
        </p>
      </footer>
    </div>

    <ImportConnectionDialog
        :open="showImportDialog"
        :file-name="importFile?.name ?? ''"
        :busy="importBusy"
        @update:open="onImportDialogOpenChange"
        @confirm="confirmImportProfilePackage"
    />
    <ThirdPartyConnectionImportDialog
        :open="showThirdPartyImportDialog"
        :file-name="thirdPartyFileName"
        :parse="thirdPartyParse"
        :busy="thirdPartyBusy"
        @update:open="onThirdPartyImportOpenChange"
        @confirm="confirmThirdPartyImport"
    />
  </div>
</template>

<style scoped>
.welcome {
  --welcome-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --welcome-gap: clamp(0.5rem, 2cqh, 1.25rem);
  --welcome-pad-x: clamp(0.85rem, 2.5cqi, 2.75rem);
  --welcome-pad-y: clamp(0.55rem, 1.6cqh, 1.35rem);
  container-type: size;
  container-name: welcome;
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: flex;
  align-items: stretch;
  justify-content: center;
  height: 100%;
  min-height: 0;
  min-width: 0;
  padding: var(--welcome-pad-y) var(--welcome-pad-x);
  background: var(--dw-bg-editor);
}

.welcome--picker {
  align-items: center;
  overflow: auto;
}

.welcome__atmosphere {
  pointer-events: none;
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
}

.welcome__beam {
  position: absolute;
  border-radius: 50%;
  filter: blur(8px);
  opacity: 0.9;
  animation: welcome-beam 12s var(--welcome-ease) infinite alternate;
}

.welcome__beam--a {
  width: min(58cqw, 720px);
  height: min(58cqw, 720px);
  top: -18%;
  left: -12%;
  background: radial-gradient(
      circle at 40% 40%,
      color-mix(in srgb, var(--dw-primary) 22%, transparent),
      transparent 68%
  );
}

.welcome__beam--b {
  width: min(48cqw, 560px);
  height: min(48cqw, 560px);
  right: -8%;
  bottom: -20%;
  background: radial-gradient(
      circle at 50% 50%,
      color-mix(in srgb, var(--dw-info-fg, var(--dw-primary)) 12%, transparent),
      transparent 70%
  );
  animation-delay: -4s;
}

.welcome__grid {
  position: absolute;
  inset: 0;
  opacity: 0.22;
  background-image:
      linear-gradient(color-mix(in srgb, var(--dw-border) 55%, transparent) 1px, transparent 1px),
      linear-gradient(90deg, color-mix(in srgb, var(--dw-border) 55%, transparent) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse 70% 60% at 50% 35%, #000 20%, transparent 75%);
}

.welcome-stage {
  position: relative;
  z-index: 1;
  width: min(1080px, 100%);
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--welcome-gap);
  animation: welcome-in 420ms var(--welcome-ease) both;
}

.welcome-stage--picker {
  width: min(640px, 100%);
  height: auto;
  margin: auto;
}

.welcome-hero {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: clamp(0.35rem, 0.9cqh, 0.7rem);
  min-width: 0;
  margin-top: auto;
}

.welcome-hero__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem 1.25rem;
  min-width: 0;
}

.welcome-hero__brand {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  min-width: 0;
}

.welcome-hero__titles {
  min-width: 0;
}

.welcome-hero__logo {
  flex: 0 0 auto;
  filter: drop-shadow(0 0 18px color-mix(in srgb, var(--dw-primary) 35%, transparent));
  animation: welcome-logo 700ms var(--welcome-ease) both;
}

.welcome-hero__title {
  margin: 0;
  font-size: clamp(1.55rem, 4.2cqh, 2.85rem);
  font-weight: 750;
  letter-spacing: -0.045em;
  line-height: 0.95;
  color: var(--dw-text);
}

.welcome-hero__kicker {
  margin: 0.2rem 0 0;
  font-size: clamp(0.85rem, 1.8cqh, 1.15rem);
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.25;
  color: var(--dw-text);
}

.welcome-hero__lead {
  margin: 0;
  max-width: 40rem;
  font-size: var(--dw-text-sm);
  line-height: 1.45;
  color: var(--dw-text-secondary);
}

.welcome-stats {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.35rem;
  flex: 0 1 auto;
}

.welcome-stats li {
  display: inline-flex;
  align-items: baseline;
  gap: 0.3rem;
  padding: 0.28rem 0.55rem;
  border-radius: var(--dw-radius-pill);
  border: 1px solid color-mix(in srgb, var(--dw-border) 65%, transparent);
  background: color-mix(in srgb, var(--dw-bg-panel) 70%, transparent);
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.welcome-stats b {
  color: var(--dw-text);
  font-size: var(--dw-text-sm);
  font-weight: 700;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
}

.welcome-primary {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.45rem;
  padding: 0.15rem 0 0.35rem;
}

.welcome-primary__btn {
  min-height: var(--dw-density-lg, var(--dw-control-h-lg, 2.25rem));
  padding-inline: 1.15rem;
  font-weight: 650;
}

.welcome-primary__hint {
  margin: 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  max-width: 28rem;
  line-height: 1.4;
}

.welcome-continue {
  width: 100%;
  min-width: 0;
}

.welcome-fold {
  flex: 0 0 auto;
  border: 1px solid color-mix(in srgb, var(--dw-border) 55%, transparent);
  border-radius: calc(var(--dw-menu-radius, 8px) + 2px);
  background: color-mix(in srgb, var(--dw-bg-panel) 78%, transparent);
  overflow: hidden;
}

.welcome-fold > summary {
  cursor: pointer;
  list-style: none;
  padding: 0.55rem 0.85rem;
  font-size: var(--dw-text-xs);
  font-weight: 650;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--dw-text-muted);
  user-select: none;
}

.welcome-fold > summary::-webkit-details-marker {
  display: none;
}

.welcome-fold > summary::after {
  content: '+';
  float: right;
  font-weight: 600;
  color: var(--dw-text-secondary);
}

.welcome-fold[open] > summary::after {
  content: '−';
}

.welcome-steps--fold {
  border-top: 1px solid color-mix(in srgb, var(--dw-border) 48%, transparent);
}

.welcome-strip--fold {
  padding: 0.45rem 0.85rem 0.7rem;
}

.welcome-paths {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(0.35rem, 0.8cqh, 0.6rem);
  width: 100%;
  min-width: 0;
}

.welcome-paths--secondary .welcome-path {
  padding: clamp(0.4rem, 0.9cqh, 0.65rem) clamp(0.5rem, 0.9cqi, 0.75rem);
  opacity: 0.96;
}

.welcome-pulse__main--history-only {
  grid-template-columns: minmax(0, 1fr);
}

.welcome-pulse__main--history-only .welcome-pulse__rail--history {
  padding-left: 0;
}

.welcome-path {
  --welcome-stagger: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.55rem;
  min-height: 0;
  min-width: 0;
  padding: clamp(0.55rem, 1.2cqh, 0.85rem) clamp(0.6rem, 1cqi, 0.9rem);
  border: 1px solid color-mix(in srgb, var(--dw-border) 70%, transparent);
  border-radius: calc(var(--dw-menu-radius, 8px) + 2px);
  background:
      linear-gradient(
          160deg,
          color-mix(in srgb, var(--dw-bg-panel) 92%, var(--dw-primary) 8%),
          color-mix(in srgb, var(--dw-bg-panel) 96%, transparent)
      );
  color: var(--dw-text);
  text-align: left;
  cursor: pointer;
  transition:
      border-color 160ms ease,
      background 160ms ease,
      transform 160ms var(--welcome-ease),
      box-shadow 160ms ease;
  animation: welcome-path-in 480ms var(--welcome-ease) both;
  animation-delay: calc(80ms + var(--welcome-stagger) * 70ms);
}

.welcome-path:hover {
  border-color: color-mix(in srgb, var(--dw-primary) 42%, var(--dw-border));
  background:
      linear-gradient(
          160deg,
          color-mix(in srgb, var(--dw-bg-panel) 82%, var(--dw-primary) 18%),
          color-mix(in srgb, var(--dw-bg-panel) 94%, transparent)
      );
  transform: translateY(-1px);
  box-shadow: 0 8px 22px color-mix(in srgb, var(--dw-bg) 55%, transparent);
}

.welcome-path:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--dw-primary) 55%, transparent);
  outline-offset: 2px;
}

.welcome-path.is-preferred {
  border-color: color-mix(in srgb, var(--dw-primary) 55%, var(--dw-border));
  box-shadow:
      inset 0 0 0 1px color-mix(in srgb, var(--dw-primary) 22%, transparent),
      0 0 0 1px color-mix(in srgb, var(--dw-primary) 12%, transparent);
}

.welcome-path__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: clamp(1.7rem, 3.5cqh, 2.15rem);
  height: clamp(1.7rem, 3.5cqh, 2.15rem);
  border-radius: var(--dw-control-radius);
  background: color-mix(in srgb, var(--dw-primary) 14%, transparent);
  color: var(--dw-primary);
}

.welcome-path__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
}

.welcome-path__copy strong {
  font-size: var(--dw-text-sm);
  font-weight: 650;
  letter-spacing: -0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.welcome-path__copy em {
  font-style: normal;
  font-size: var(--dw-text-xs);
  line-height: 1.35;
  color: var(--dw-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.welcome-path__go {
  color: var(--dw-text-secondary);
}

.welcome-path:hover .welcome-path__go {
  color: var(--dw-primary);
  opacity: 1;
}

.welcome-body {
  flex: 0 1 auto;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--welcome-gap);
  overflow: hidden;
}

.welcome-pulse {
  flex: 0 1 auto;
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 0;
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--dw-border) 58%, transparent);
  border-radius: calc(var(--dw-menu-radius, 8px) + 4px);
  background:
      linear-gradient(
          145deg,
          color-mix(in srgb, var(--dw-bg-panel) 88%, var(--dw-primary) 6%),
          color-mix(in srgb, var(--dw-bg-panel) 92%, transparent)
      );
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--dw-text) 4%, transparent);
  overflow: hidden;
}

.welcome-pulse__main {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) auto minmax(0, 0.95fr);
  align-items: stretch;
  gap: 0;
  min-width: 0;
  padding: clamp(0.65rem, 1.4cqh, 1rem) clamp(0.75rem, 1.4cqi, 1.15rem);
}

.welcome-pulse__rail {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 0;
  min-height: 0;
}

.welcome-pulse__rail--connections {
  gap: 0.55rem;
}

.welcome-pulse__rail--history {
  padding-left: clamp(0.55rem, 1.2cqi, 0.9rem);
  overflow: visible;
}

.welcome-conn-rows {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem 0.75rem;
  min-width: 0;
  align-items: start;
  flex: 1 1 auto;
}

.welcome-conn-row {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 0;
  min-height: 0;
}

.welcome-pulse__divider {
  width: 1px;
  align-self: stretch;
  margin: 0.15rem 0;
  background: linear-gradient(
      180deg,
      transparent,
      color-mix(in srgb, var(--dw-border) 80%, transparent) 18%,
      color-mix(in srgb, var(--dw-border) 80%, transparent) 82%,
      transparent
  );
}

.welcome-pulse__head h2 {
  margin: 0;
  font-size: var(--dw-text-xs);
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--dw-text-muted);
}

.welcome-pulse__head p {
  margin: 0.12rem 0 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.welcome-tiles {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-height: 0;
  flex: 0 0 auto;
}

.welcome-tile {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 0.65rem;
  padding: 0.55rem 0.65rem;
  border: 1px solid color-mix(in srgb, var(--dw-border) 45%, transparent);
  border-radius: calc(var(--dw-control-radius) + 2px);
  background: color-mix(in srgb, var(--dw-bg-editor) 55%, transparent);
  color: var(--dw-text);
  text-align: left;
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease, transform 120ms var(--welcome-ease);
}

.welcome-tile:hover {
  border-color: color-mix(in srgb, var(--dw-primary) 40%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-bg-panel) 70%, var(--dw-primary) 10%);
  transform: translateY(-1px);
}

.welcome-tile.is-connected {
  border-color: color-mix(in srgb, var(--dw-success, var(--dw-primary)) 28%, var(--dw-border));
}

.welcome-tile__icon {
  position: relative;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.4rem;
  height: 2.4rem;
  border-radius: var(--dw-control-radius);
  background: color-mix(in srgb, var(--dw-primary) 12%, transparent);
}

.welcome-tile__icon :deep(svg),
.welcome-tile__icon :deep(img) {
  width: 1.35rem;
  height: 1.35rem;
}

.welcome-tile__dot {
  position: absolute;
  right: 0.15rem;
  bottom: 0.15rem;
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 999px;
  background: var(--dw-success, #3ecf8e);
  box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--dw-bg-editor) 90%, transparent);
}

.welcome-tile__copy {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
}

.welcome-tile__copy strong {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
  font-size: var(--dw-text-sm);
  font-weight: 650;
}

.welcome-tile__name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.welcome-tile__meta {
  margin: 0;
  font-style: normal;
  font-family: var(--dw-font-mono, ui-monospace, monospace);
  font-size: var(--dw-text-2xs);
  line-height: 1.35;
  color: var(--dw-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.welcome-sql {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  flex: 0 0 auto;
}

.welcome-sql > li {
  flex: 0 0 auto;
}

.welcome-sql button {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.08rem;
  padding: 0.35rem 0.4rem;
  border: 0;
  border-radius: var(--dw-control-radius);
  background: transparent;
  color: var(--dw-text-secondary);
  text-align: left;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}

.welcome-sql button:hover {
  background: color-mix(in srgb, var(--dw-text) 5%, transparent);
  color: var(--dw-text);
}

.welcome-sql code {
  display: block;
  width: 100%;
  font-family: var(--dw-font-mono, ui-monospace, monospace);
  font-size: var(--dw-text-xs);
  font-weight: 500;
  color: color-mix(in srgb, var(--dw-primary) 72%, var(--dw-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.welcome-sql span {
  display: block;
  width: 100%;
  font-size: var(--dw-text-2xs);
  color: var(--dw-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.welcome-steps {
  list-style: none;
  margin: 0;
  padding: 0.45rem clamp(0.55rem, 1cqi, 0.85rem);
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.4rem;
  border-top: 1px solid color-mix(in srgb, var(--dw-border) 48%, transparent);
  background: color-mix(in srgb, var(--dw-bg-editor) 42%, transparent);
  min-width: 0;
}

.welcome-steps button {
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.4rem 0.5rem;
  border: 1px solid transparent;
  border-radius: var(--dw-control-radius);
  background: transparent;
  color: var(--dw-text);
  text-align: left;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;
}

.welcome-steps button:hover {
  background: color-mix(in srgb, var(--dw-primary) 10%, transparent);
  border-color: color-mix(in srgb, var(--dw-primary) 22%, transparent);
}

.welcome-steps b {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.35rem;
  height: 1.35rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dw-primary) 16%, transparent);
  color: var(--dw-primary);
  font-size: var(--dw-text-2xs);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.welcome-steps__body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
}

.welcome-steps strong {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  min-width: 0;
  font-size: var(--dw-text-sm);
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dw-text);
}

.welcome-steps strong :deep(svg) {
  flex: 0 0 auto;
  color: var(--dw-primary);
}

.welcome-steps em {
  font-style: normal;
  font-size: var(--dw-text-2xs);
  color: var(--dw-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.welcome-strip {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.55rem 1rem;
  min-width: 0;
  padding: 0.15rem 0.1rem;
}

.welcome-band--empty {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 0.2rem 0;
}

.welcome-empty-line {
  margin: 0.1rem 0 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.welcome-kbd {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.55rem;
  min-width: 0;
}

.welcome-kbd li {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-secondary);
  min-width: 0;
}

.welcome-kbd li span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.welcome-kbd kbd {
  display: inline-flex;
  justify-content: center;
  min-width: 3.6rem;
  padding: 0.2rem 0.4rem;
  border: 1px solid color-mix(in srgb, var(--dw-border) 80%, transparent);
  border-radius: var(--dw-control-radius-sm);
  background: color-mix(in srgb, var(--dw-bg-muted) 80%, transparent);
  color: var(--dw-text);
  font-family: var(--dw-font-mono, ui-monospace, monospace);
  font-size: var(--dw-text-2xs);
  font-weight: 600;
  letter-spacing: 0.02em;
}

.welcome-chips {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.35rem;
  min-width: 0;
}

.welcome-chips button {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.65rem;
  border: 1px solid color-mix(in srgb, var(--dw-border) 55%, transparent);
  border-radius: var(--dw-radius-pill);
  background: color-mix(in srgb, var(--dw-bg-panel) 72%, transparent);
  color: var(--dw-text);
  font-size: var(--dw-text-xs);
  font-weight: 550;
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease, color 120ms ease;
}

.welcome-chips button:hover {
  border-color: color-mix(in srgb, var(--dw-primary) 40%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-primary) 12%, transparent);
  color: var(--dw-primary);
}

.welcome-foot {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.85rem;
  margin-top: auto;
  padding-top: 0.45rem;
  border-top: 1px solid color-mix(in srgb, var(--dw-border) 48%, transparent);
  min-width: 0;
}

.welcome-foot__label {
  font-size: var(--dw-text-2xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--dw-text-muted);
}

.welcome-foot__actions {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.2rem;
  min-width: 0;
}

.welcome-foot__actions button {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.28rem 0.45rem;
  border: 0;
  border-radius: var(--dw-control-radius);
  background: transparent;
  color: var(--dw-primary);
  font-size: var(--dw-text-xs);
  cursor: pointer;
}

.welcome-foot__actions button:hover {
  background: color-mix(in srgb, var(--dw-text) 5%, transparent);
}

.welcome-foot__hint {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin: 0 0 0 auto;
  font-size: var(--dw-text-2xs);
  color: var(--dw-text-muted);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.welcome-picker {
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-menu-radius);
  overflow: hidden;
  background: var(--dw-bg-elevated, var(--dw-bg-panel));
}

.welcome-picker__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.65rem 0.85rem;
  border-bottom: 1px solid var(--dw-border);
  font-size: var(--dw-text-xs);
}

.welcome-picker__bar button {
  border: 0;
  background: transparent;
  color: var(--dw-text-secondary);
  cursor: pointer;
}

@keyframes welcome-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes welcome-logo {
  from {
    opacity: 0;
    transform: scale(0.92);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes welcome-path-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes welcome-beam {
  from {
    transform: translate3d(0, 0, 0) scale(1);
  }
  to {
    transform: translate3d(2%, 3%, 0) scale(1.06);
  }
}

/* 矮视口：收起次要文案，优先保住品牌与主 CTA / 继续 */
@container welcome (max-height: 720px) {
  .welcome-hero__lead,
  .welcome-primary__hint,
  .welcome-pulse__head p,
  .welcome-path__copy em,
  .welcome-steps em,
  .welcome-kbd li span,
  .welcome-foot__hint {
    display: none;
  }
}

@container welcome (max-height: 580px) {
  .welcome-fold,
  .welcome-paths--secondary {
    display: none;
  }

  .welcome-hero,
  .welcome-foot {
    margin-top: 0;
  }

  .welcome-hero__kicker {
    display: none;
  }

  .welcome-stats li span {
    display: none;
  }
}

@container welcome (max-width: 760px) {
  .welcome-hero__top {
    flex-direction: column;
    align-items: stretch;
  }

  .welcome-stats {
    justify-content: flex-start;
  }

  .welcome-paths,
  .welcome-steps,
  .welcome-conn-rows {
    grid-template-columns: 1fr;
  }

  .welcome-pulse__main {
    grid-template-columns: 1fr;
    max-height: none;
  }

  .welcome-pulse__divider {
    width: auto;
    height: 1px;
    margin: 0.35rem 0;
    background: linear-gradient(
        90deg,
        transparent,
        color-mix(in srgb, var(--dw-border) 80%, transparent) 18%,
        color-mix(in srgb, var(--dw-border) 80%, transparent) 82%,
        transparent
    );
  }

  .welcome-pulse__rail--history {
    padding-left: 0;
  }

  .welcome-strip {
    flex-direction: column;
    align-items: stretch;
  }

  .welcome-chips {
    justify-content: flex-start;
  }

  .welcome-foot__hint {
    margin-left: 0;
  }
}

@media (max-height: 700px) {
  .welcome-hero__lead,
  .welcome-primary__hint,
  .welcome-pulse__head p,
  .welcome-path__copy em,
  .welcome-steps em,
  .welcome-kbd li span {
    display: none;
  }
}

@media (max-height: 560px) {
  .welcome-fold,
  .welcome-paths--secondary {
    display: none;
  }

  .welcome-hero,
  .welcome-foot {
    margin-top: 0;
  }
}

@media (max-width: 960px) {
  .welcome-paths,
  .welcome-steps {
    grid-template-columns: 1fr;
  }

  .welcome-pulse__main {
    grid-template-columns: 1fr;
  }

  .welcome-pulse__divider {
    width: auto;
    height: 1px;
    margin: 0.35rem 0;
  }

  .welcome-pulse__rail--history {
    padding-left: 0;
  }

  .welcome-strip {
    flex-direction: column;
    align-items: stretch;
  }

  .welcome-chips {
    justify-content: flex-start;
  }

  .welcome-foot__hint {
    margin-left: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .welcome-stage,
  .welcome-hero__logo,
  .welcome-path,
  .welcome__beam {
    animation: none;
  }

  .welcome-path:hover,
  .welcome-tile:hover {
    transform: none;
  }
}
</style>
