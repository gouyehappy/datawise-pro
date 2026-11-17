<!--
  欢迎 Tab — A1: 零连接单主 CTA；有连接时「继续」优先，主路径次级；Explore 默认收起
-->
<script setup lang="ts">
import {computed, onMounted, ref, shallowRef, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useFeaturePermission} from '@/features/auth/composables/useFeaturePermission'
import {FeaturePermission} from '@/features/auth/types/feature-permission.types'
import {
    canImportExplorerConnections,
    canOpenConnectionCatalogForm,
} from '@/features/auth/services/feature-permission.service'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {useDatasourceCatalogStore} from '@/features/datasource/stores/datasource-catalog'
import {useShortcutPanelStore} from '@/features/layout/stores/shortcut-panel-store'
import {formatShortcutLabel} from '@/features/layout/composables/useAppShortcutListener'
import AppBrandLogo from '@/features/layout/components/AppBrandLogo.vue'
import {DwButton} from '@/core/components'
import {DwIcon} from '@/core/icons'
import DbTypeContextPanel from '@/features/explorer/components/DbTypeContextPanel.vue'
import ConnectionEnvBadge from '@/features/explorer/components/ConnectionEnvBadge.vue'
import ImportConnectionDialog from '@/features/explorer/components/ImportConnectionDialog.vue'
import ThirdPartyConnectionImportDialog from '@/features/explorer/components/ThirdPartyConnectionImportDialog.vue'
import {
    pickRecentSavedConsoles,
    pickRecentSqlLogs,
} from '@/features/dashboard/services/dashboard-summary.service'
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
    type WelcomeConnectionRow,
} from '@/features/workspace/services/welcome-main-paths.service'
import {
    readAddedConnectionIds,
    readRecentConnectionIds,
} from '@/features/workspace/services/welcome-recent-connections.service'
import {formatWelcomeConnectionSubtitle} from '@/features/workspace/services/welcome-connection-subtitle.service'
import {fetchConnectionConfig} from '@/shared/config/connections-catalog.service'
import TreeNodeIcon from '@/features/explorer/components/TreeNodeIcon.vue'
import {useWelcomeConnectionImport} from '@/features/workspace/composables/useWelcomeConnectionImport'
import {
    useWelcomeHomeActions,
    type WelcomeHistoryItem,
} from '@/features/workspace/composables/useWelcomeHomeActions'

const {t} = useI18n()
const explorer = useExplorerStore()
const layout = useLayoutStore()
const appConfig = useAppConfigStore()
const catalog = useDatasourceCatalogStore()
const auth = useAuthStore()
const shortcutPanel = useShortcutPanelStore()
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

const {
  showImportDialog,
  importFile,
  importBusy,
  showThirdPartyImportDialog,
  thirdPartyParse,
  thirdPartyFileName,
  thirdPartyBusy,
  openImportConnections,
  onImportDialogOpenChange,
  onThirdPartyImportOpenChange,
  confirmThirdPartyImport,
  confirmImportProfilePackage,
} = useWelcomeConnectionImport()

const {
  showTypePicker,
  openNewConnection,
  onPickDbType,
  openRecent,
  openHistoryItem,
  runPath,
  runWorkflowStep,
  runExploreLink,
  runCommonAction,
} = useWelcomeHomeActions({
  hasConnections,
  canCreateConnection,
  openImportConnections,
})

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

<style scoped src="../../styles/welcome-tab.css"></style>
