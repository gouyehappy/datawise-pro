<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import {storeToRefs} from 'pinia'
import {useI18n} from 'vue-i18n'
import type {NavModule} from '@/core/types'
import DashboardLayoutDialog from '@/features/dashboard/components/DashboardLayoutDialog.vue'
import DashboardAiWidgetDialog from '@/features/dashboard/components/DashboardAiWidgetDialog.vue'
import DashboardSharesDialog from '@/features/dashboard/components/DashboardSharesDialog.vue'
import DashboardSettingsMenu from '@/features/dashboard/components/DashboardSettingsMenu.vue'
import DashboardWidgetById from '@/features/dashboard/components/DashboardWidgetById.vue'
import DashboardSavedChartWidget from '@/features/dashboard/components/widgets/DashboardSavedChartWidget.vue'
import {useDashboardTeamWidgets} from '@/features/dashboard/composables/useDashboardTeamWidgets'
import {useDashboardWidgetDrag} from '@/features/dashboard/composables/useDashboardWidgetDrag'
import {
  buildDashboardStats,
  extractDashboardConnections,
  pickEnabledPlugins,
  pickRecentSavedConsoles,
  pickRecentSqlLogs,
  summarizeConnectionHealth,
  type DashboardQuickActionId,
  type DashboardStatKey,
} from '@/features/dashboard/services/dashboard-summary.service'
import {asDashboardPreferences, visibleWidgetIdsForColumn} from '@/features/dashboard/services/dashboard-widget.service'
import {
  chartWidgetsForColumn,
  removeDashboardChartWidget,
} from '@/features/dashboard/services/dashboard-chart-widget.service'
import {useDashboardConnectionRuntime} from '@/features/dashboard/composables/useDashboardConnectionRuntime'
import type {DashboardWidgetColumn, DashboardWidgetId} from '@/features/dashboard/services/dashboard-widget.service'
import {collectConnectionHealthAlerts} from '@/features/explorer/services/connection-health-alert.service'
import {dispatchConnectionHealthAlert} from '@/features/layout/services/app-alert.actions'
import {
    resolveActiveTeamOnCallConnectionIds,
    resolveOnCallConnectionRefs,
} from '@/features/team/services/team-on-call-pack.service'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useNotificationStore} from '@/features/layout/stores/notification-store'
import {useShortcutPanelStore} from '@/features/layout/stores/shortcut-panel-store'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import {usePluginPresetSummary} from '@/features/plugin/composables/usePluginPresetSummary'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useTeamStore} from '@/features/team/stores/team-store'
import {DwButton, ModulePageHeader, ModulePageRegions, MpJourneyStrip} from '@/core/components'
import ReleaseHighlightsCards from '@/features/layout/components/ReleaseHighlightsCards.vue'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {extractConnectionsFromTree} from '@/features/explorer/utils/tree-targets'
import type {ReleaseHighlightAction} from '@/features/layout/services/release-highlights.service'
import {applySuggestedDashboardWidget} from '@/features/dashboard/services/dashboard-widget-ai.service'

defineOptions({name: 'DashboardView'})

const STAT_META: Record<DashboardStatKey, { tone: string }> = {
  connections: {tone: 'sky'},
  sqlRuns: {tone: 'violet'},
  savedConsoles: {tone: 'amber'},
  plugins: {tone: 'emerald'},
}

const {t} = useI18n()
const layout = useLayoutStore()
const appConfig = useAppConfigStore()
const shortcutPanel = useShortcutPanelStore()
const pluginStore = usePluginStore()
const entitlement = useEntitlementStore()
const explorer = useExplorerStore()
const workspace = useWorkspaceStore()
const teamStore = useTeamStore()
const notifications = useNotificationStore()
const {hasOpenTabs, tabs, activeTabId} = storeToRefs(workspace)

const layoutDialogOpen = ref(false)
const aiWidgetDialogOpen = ref(false)
const sharesDialogOpen = ref(false)

const {
    layoutEditMode,
    toggleLayoutEditMode,
    isDragging,
    isDropTarget,
    onWidgetDragStart,
    onWidgetDragOver,
    onWidgetDrop,
    onWidgetDragEnd,
    onColumnDrop,
} = useDashboardWidgetDrag((prefs) => appConfig.patchDashboardPreferences(prefs))

const {
    activeTeam,
    auditLogs,
    sharedAiSessions,
    loading: teamWidgetsLoading,
} = useDashboardTeamWidgets(() => appConfig.dashboardPreferences.widgets)

function onColumnDragOver(column: DashboardWidgetColumn, index: number) {
    if (layoutEditMode.value) onWidgetDragOver(column, index)
}

function onWidgetDragStartFor(column: DashboardWidgetColumn, index: number, widgetId: DashboardWidgetId, event: DragEvent) {
    onWidgetDragStart(widgetId, column, index, event)
}

function onWidgetDropFor(column: DashboardWidgetColumn, index: number) {
    onWidgetDrop(column, index, asDashboardPreferences(appConfig.dashboardPreferences))
}

const leftWidgetIds = computed(() =>
    visibleWidgetIdsForColumn(appConfig.dashboardPreferences, 'left'),
)
const mainWidgetIds = computed(() =>
    visibleWidgetIdsForColumn(appConfig.dashboardPreferences, 'main'),
)
const rightWidgetIds = computed(() =>
    visibleWidgetIdsForColumn(appConfig.dashboardPreferences, 'right'),
)

const leftChartWidgets = computed(() =>
    chartWidgetsForColumn(appConfig.dashboardPreferences, 'left'),
)
const mainChartWidgets = computed(() =>
    chartWidgetsForColumn(appConfig.dashboardPreferences, 'main'),
)
const rightChartWidgets = computed(() =>
    chartWidgetsForColumn(appConfig.dashboardPreferences, 'right'),
)

function removeChartWidget(id: string) {
  appConfig.patchDashboardPreferences(
      removeDashboardChartWidget(asDashboardPreferences(appConfig.dashboardPreferences), id),
  )
}

const stats = computed(() =>
    buildDashboardStats({
      connectionCount: explorer.connectionCount,
      sqlLogCount: shortcutPanel.sqlLogs.length,
      savedConsoleCount: shortcutPanel.savedConsoles.length,
      enabledPluginCount: pluginStore.enabledCount,
    }),
)

const statLabels = computed<Record<DashboardStatKey, string>>(() => ({
  connections: t('dashboard.stats.connections'),
  sqlRuns: t('dashboard.stats.sqlRuns'),
  savedConsoles: t('dashboard.stats.savedConsoles'),
  plugins: t('dashboard.stats.plugins'),
}))

const statUnits = computed<Record<DashboardStatKey, string>>(() => ({
  connections: t('dashboard.unit.count'),
  sqlRuns: t('dashboard.unit.times'),
  savedConsoles: t('dashboard.unit.count'),
  plugins: t('dashboard.unit.count'),
}))

const recentLogs = computed(() => pickRecentSqlLogs(shortcutPanel.sqlLogs, 12))
const recentConsoles = computed(() => pickRecentSavedConsoles(shortcutPanel.savedConsoles, 8))
const connections = computed(() =>
    extractDashboardConnections(explorer.tree, explorer.connectionHealthById),
)
const {
    enrichedConnections,
    runtimeOverview,
    metricsLoading,
    refreshRuntimeMetrics,
} = useDashboardConnectionRuntime(() => connections.value)
const connectionHealthSummary = computed(() => summarizeConnectionHealth(connections.value))
const openTabs = computed(() => tabs.value)
const enabledPlugins = computed(() => pickEnabledPlugins(pluginStore.items, 8))
const {referencePresetId, referencePresetConflictCount} = usePluginPresetSummary()
const onCallConnections = computed(() =>
    resolveOnCallConnectionRefs(
        explorer.tree,
        resolveActiveTeamOnCallConnectionIds(
            teamStore.teams,
            teamStore.activeTeamId,
        ),
    ),
)
const activeTeamName = computed(() => activeTeam.value?.name ?? '')

function statLabel(key: DashboardStatKey): string {
  return statLabels.value[key]
}

function statUnit(key: DashboardStatKey): string {
  return statUnits.value[key]
}

async function refreshConnectionHealth() {
  if (!explorer.hasAttemptedConnections()) {
    await refreshRuntimeMetrics()
    return
  }
  const before = {...explorer.connectionHealthById}
  await Promise.all([explorer.probeAllConnectionHealth(), refreshRuntimeMetrics()])
  const rows = extractDashboardConnections(explorer.tree, explorer.connectionHealthById)
  const alerts = collectConnectionHealthAlerts(before, rows, appConfig.connectionHealthPreferences)
  for (const row of alerts) {
    void dispatchConnectionHealthAlert(row, appConfig.connectionHealthPreferences, {
      showToast: (message) => layout.showErrorToast(message),
      toastMessage: t('dashboard.connectionHealthFailed', {name: row.name}),
      pushNotification: (input) => notifications.push(input),
    })
  }
}

onMounted(() => {
  void refreshRuntimeMetrics()
})

function openConnectionHealthSettings() {
  layout.setSettingsSection('connectionHealth')
  layout.setModule('settings')
}

function openModule(module: NavModule) {
  layout.setModule(module)
}

function openDatabase() {
  openModule('database')
}

function continueWork() {
  openModule('database')
}

function openAi() {
  if (!entitlement.guardAiNav()) return
  openModule('ai')
}

function openPlugins() {
    pluginStore.openPackStore()
}

function focusDashboardPlugin(id: string) {
  pluginStore.focusPlugin(id)
}

function openPluginPresetDiff() {
  pluginStore.openPluginPresetDiff()
}

function alignDashboardReferencePreset() {
  pluginStore.alignToReferencePreset()
}

function openNewConsole() {
  openModule('database')
  workspace.openConsole()
}

function openConsoleFromLog(sql: string) {
  openModule('database')
  workspace.openConsole({sql})
}

function openSavedConsole(item: { name: string; connectionName: string; sql?: string }) {
  openModule('database')
  workspace.openConsole({
    connectionName: item.connectionName,
    sql: item.sql ?? 'SELECT 1;',
  })
}

function openWorkspaceTab(tabId: string) {
  openModule('database')
  workspace.activateTab(tabId)
}

function onStatClick(navTarget: 'database' | 'plugin' | null) {
  if (!navTarget) return
  openModule(navTarget)
}

function onQuickAction(id: DashboardQuickActionId) {
  if (id === 'continueWork' && !hasOpenTabs.value) return
  switch (id) {
    case 'newConsole':
      openNewConsole()
      break
    case 'continueWork':
      continueWork()
      break
    case 'openAi':
      openAi()
      break
    case 'openPlugins':
      openPlugins()
      break
  }
}

function openTeam() {
  openModule('team')
}

async function openOnCallConnection(connectionId: string) {
  openModule('database')
  const located = await explorer.locateNode(connectionId)
  if (!located) {
    layout.showErrorToast(t('explorer.teamSharedMissing', {id: connectionId}))
  }
}

function runReleaseAction(action: ReleaseHighlightAction) {
  if (action === 'open_ai') {
    openAi()
    return
  }
  if (action === 'open_sql_console') {
    openNewConsole()
    return
  }
  if (action === 'open_federated_wizard') {
    const connections = extractConnectionsFromTree(explorer.tree)
    const scoped = connections.find((item) => item.databases.length > 0)
    if (!scoped) {
      openDatabase()
      layout.showErrorToast(t('platform.release.needScope'))
      return
    }
    openDatabase()
    workspace.openPlatformCatalog({
      feature: 'federated_views',
      connectionId: scoped.id,
      database: scoped.databases[0].label,
      instanceId: scoped.databases[0].id,
    })
  }
}

function openAiWidgetDialog() {
  aiWidgetDialogOpen.value = true
}

function applyAiWidget(payload: { prompt: string; widgetId: DashboardWidgetId; column: DashboardWidgetColumn }) {
  const next = applySuggestedDashboardWidget(
      asDashboardPreferences(appConfig.dashboardPreferences),
      payload.widgetId,
      payload.column,
  )
  appConfig.patchDashboardPreferences(next)
}
</script>

<template>
  <div class="module-page module-page--scroll dashboard dashboard-page">
    <div class="mp-page-wrap dashboard-page__wrap">
      <ModulePageRegions>
        <template #header>
          <ModulePageHeader
              :title="t('dashboard.title')"
              :eyebrow="t('dashboard.eyebrow')"
              :subtitle="t('dashboard.subtitle')"
          >
            <template #settings>
              <DashboardSettingsMenu
                  :layout-edit-mode="layoutEditMode"
                  @toggle-layout-edit="toggleLayoutEditMode"
                  @customize="layoutDialogOpen = true"
                  @ai-widget="openAiWidgetDialog"
                  @shares="sharesDialogOpen = true"
              />
            </template>
          </ModulePageHeader>
        </template>

        <template #journey>
          <MpJourneyStrip
              :entitlement-mode="entitlement.mode"
              :locked-count="entitlement.lockedCount"
              :on-browse-packs="() => pluginStore.openPackStore()"
          />
          <ReleaseHighlightsCards scope="dashboard" @action="runReleaseAction"/>
        </template>

        <template #status>
          <section class="mp-status" :aria-label="t('dashboard.metrics')">
            <button
                v-for="item in stats"
                :key="item.key"
                type="button"
                class="mp-status__item"
                :class="`mp-status__item--${STAT_META[item.key].tone}`"
                @click="onStatClick(item.navTarget)"
            >
              <span class="mp-status__label">{{ statLabel(item.key) }}</span>
              <strong class="mp-status__value">
                {{ item.value }}<small v-if="statUnit(item.key)" class="mp-status__unit">{{ statUnit(item.key) }}</small>
              </strong>
            </button>
          </section>
        </template>

        <template #toolbar>
          <div v-if="layoutEditMode" class="dash-edit-bar" role="status">
            <p class="dash-edit-bar__hint">{{ t('dashboard.layoutEditHint') }}</p>
            <DwButton variant="secondary" @click="toggleLayoutEditMode">
              {{ t('dashboard.layoutEditDone') }}
            </DwButton>
          </div>
        </template>

      <div class="mp-columns-3 dash-layout" :class="{ 'is-editing': layoutEditMode }">
        <aside
            class="dash-col dash-col--side"
            @dragover.prevent="onColumnDragOver('left', leftWidgetIds.length)"
            @drop.prevent="onColumnDrop('left', leftWidgetIds.length, asDashboardPreferences(appConfig.dashboardPreferences))"
        >
          <DashboardSavedChartWidget
              v-for="chartWidget in leftChartWidgets"
              :key="chartWidget.id"
              :widget="chartWidget"
              :edit-mode="layoutEditMode"
              @remove="removeChartWidget(chartWidget.id)"
          />
          <DashboardWidgetById
              v-for="(widgetId, index) in leftWidgetIds"
              :key="widgetId"
              :widget-id="widgetId"
              column="left"
              :index="index"
              :edit-mode="layoutEditMode"
              :is-dragging="isDragging('left', index)"
              :is-drop-target="isDropTarget('left', index)"
              :has-open-tabs="hasOpenTabs"
              :connections="enrichedConnections"
              :health-summary="connectionHealthSummary"
              :health-checking="explorer.connectionHealthChecking"
              :health-checked-at="explorer.connectionHealthCheckedAt"
              :runtime-overview="runtimeOverview"
              :runtime-loading="metricsLoading"
              :recent-logs="recentLogs"
              :recent-consoles="recentConsoles"
              :open-tabs="openTabs"
              :active-tab-id="activeTabId"
              :enabled-plugins="enabledPlugins"
              :reference-preset-id="referencePresetId"
              :reference-preset-conflict-count="referencePresetConflictCount"
              :team-widgets-loading="teamWidgetsLoading"
              :has-active-team="!!activeTeam"
              :audit-logs="auditLogs"
              :shared-ai-sessions="sharedAiSessions"
              :on-call-connections="onCallConnections"
              :active-team-name="activeTeamName"
              @quick-action="onQuickAction"
              @refresh-health="refreshConnectionHealth"
              @open-health-settings="openConnectionHealthSettings"
              @open-database="openDatabase"
              @open-log="openConsoleFromLog"
              @open-team="openTeam"
              @open-on-call-connection="openOnCallConnection"
              @open-tab="openWorkspaceTab"
              @open-console="openSavedConsole"
              @open-plugins="openPlugins"
              @focus-plugin="focusDashboardPlugin"
              @open-preset-diff="openPluginPresetDiff"
              @align-reference-preset="alignDashboardReferencePreset"
              @drag-start="onWidgetDragStartFor('left', index, widgetId, $event)"
              @drag-over="onWidgetDragOver('left', index)"
              @drop="onWidgetDropFor('left', index)"
              @drag-end="onWidgetDragEnd"
          />
        </aside>

        <main
            class="dash-col dash-col--main"
            @dragover.prevent="onColumnDragOver('main', mainWidgetIds.length)"
            @drop.prevent="onColumnDrop('main', mainWidgetIds.length, asDashboardPreferences(appConfig.dashboardPreferences))"
        >
          <DashboardSavedChartWidget
              v-for="chartWidget in mainChartWidgets"
              :key="chartWidget.id"
              :widget="chartWidget"
              :edit-mode="layoutEditMode"
              @remove="removeChartWidget(chartWidget.id)"
          />
          <DashboardWidgetById
              v-for="(widgetId, index) in mainWidgetIds"
              :key="widgetId"
              :widget-id="widgetId"
              column="main"
              :index="index"
              :edit-mode="layoutEditMode"
              :is-dragging="isDragging('main', index)"
              :is-drop-target="isDropTarget('main', index)"
              :has-open-tabs="hasOpenTabs"
              :connections="enrichedConnections"
              :health-summary="connectionHealthSummary"
              :health-checking="explorer.connectionHealthChecking"
              :health-checked-at="explorer.connectionHealthCheckedAt"
              :runtime-overview="runtimeOverview"
              :runtime-loading="metricsLoading"
              :recent-logs="recentLogs"
              :recent-consoles="recentConsoles"
              :open-tabs="openTabs"
              :active-tab-id="activeTabId"
              :enabled-plugins="enabledPlugins"
              :reference-preset-id="referencePresetId"
              :reference-preset-conflict-count="referencePresetConflictCount"
              :team-widgets-loading="teamWidgetsLoading"
              :has-active-team="!!activeTeam"
              :audit-logs="auditLogs"
              :shared-ai-sessions="sharedAiSessions"
              :on-call-connections="onCallConnections"
              :active-team-name="activeTeamName"
              @quick-action="onQuickAction"
              @refresh-health="refreshConnectionHealth"
              @open-health-settings="openConnectionHealthSettings"
              @open-database="openDatabase"
              @open-log="openConsoleFromLog"
              @open-team="openTeam"
              @open-on-call-connection="openOnCallConnection"
              @open-tab="openWorkspaceTab"
              @open-console="openSavedConsole"
              @open-plugins="openPlugins"
              @focus-plugin="focusDashboardPlugin"
              @open-preset-diff="openPluginPresetDiff"
              @align-reference-preset="alignDashboardReferencePreset"
              @drag-start="onWidgetDragStartFor('main', index, widgetId, $event)"
              @drag-over="onWidgetDragOver('main', index)"
              @drop="onWidgetDropFor('main', index)"
              @drag-end="onWidgetDragEnd"
          />
        </main>

        <aside
            class="dash-col dash-col--side"
            @dragover.prevent="onColumnDragOver('right', rightWidgetIds.length)"
            @drop.prevent="onColumnDrop('right', rightWidgetIds.length, asDashboardPreferences(appConfig.dashboardPreferences))"
        >
          <DashboardSavedChartWidget
              v-for="chartWidget in rightChartWidgets"
              :key="chartWidget.id"
              :widget="chartWidget"
              :edit-mode="layoutEditMode"
              @remove="removeChartWidget(chartWidget.id)"
          />
          <DashboardWidgetById
              v-for="(widgetId, index) in rightWidgetIds"
              :key="widgetId"
              :widget-id="widgetId"
              column="right"
              :index="index"
              :edit-mode="layoutEditMode"
              :is-dragging="isDragging('right', index)"
              :is-drop-target="isDropTarget('right', index)"
              :has-open-tabs="hasOpenTabs"
              :connections="enrichedConnections"
              :health-summary="connectionHealthSummary"
              :health-checking="explorer.connectionHealthChecking"
              :health-checked-at="explorer.connectionHealthCheckedAt"
              :runtime-overview="runtimeOverview"
              :runtime-loading="metricsLoading"
              :recent-logs="recentLogs"
              :recent-consoles="recentConsoles"
              :open-tabs="openTabs"
              :active-tab-id="activeTabId"
              :enabled-plugins="enabledPlugins"
              :reference-preset-id="referencePresetId"
              :reference-preset-conflict-count="referencePresetConflictCount"
              :team-widgets-loading="teamWidgetsLoading"
              :has-active-team="!!activeTeam"
              :audit-logs="auditLogs"
              :shared-ai-sessions="sharedAiSessions"
              :on-call-connections="onCallConnections"
              :active-team-name="activeTeamName"
              @quick-action="onQuickAction"
              @refresh-health="refreshConnectionHealth"
              @open-health-settings="openConnectionHealthSettings"
              @open-database="openDatabase"
              @open-log="openConsoleFromLog"
              @open-team="openTeam"
              @open-on-call-connection="openOnCallConnection"
              @open-tab="openWorkspaceTab"
              @open-console="openSavedConsole"
              @open-plugins="openPlugins"
              @focus-plugin="focusDashboardPlugin"
              @open-preset-diff="openPluginPresetDiff"
              @align-reference-preset="alignDashboardReferencePreset"
              @drag-start="onWidgetDragStartFor('right', index, widgetId, $event)"
              @drag-over="onWidgetDragOver('right', index)"
              @drop="onWidgetDropFor('right', index)"
              @drag-end="onWidgetDragEnd"
          />
        </aside>
      </div>
      </ModulePageRegions>
    </div>

    <DashboardLayoutDialog v-model:open="layoutDialogOpen"/>
    <DashboardAiWidgetDialog
        v-model:open="aiWidgetDialogOpen"
        @apply="applyAiWidget"
    />
    <DashboardSharesDialog v-model:open="sharesDialogOpen"/>
  </div>
</template>

<style scoped>
.dashboard {
  line-height: var(--dw-leading-relaxed);
}

.dash-edit-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap);
  margin: 0;
  padding: var(--dw-space-3) var(--dw-space-4);
  border: 0;
  border-radius: var(--mp-shell-radius);
  background: color-mix(in srgb, var(--mp-shell-accent) 10%, var(--mp-shell-surface));
  box-shadow: inset var(--mp-shell-rail) 0 0 0 var(--mp-shell-accent);
}

.dash-edit-bar__hint {
  margin: 0;
  font-size: var(--dw-text-sm);
  color: var(--dw-text-secondary);
  line-height: var(--dw-leading);
}

.dash-layout.is-editing .dash-col {
  min-height: 120px;
}

/* dash-layout / dash-col 布局已收编到 module-page.css（.mp-columns-3 别名） */

:deep(.dash-card) {
  border: none;
  border-radius: var(--mp-shell-radius);
  background: var(--dw-bg-panel);
  box-shadow: none;
  overflow: hidden;
}

:deep(.dash-card__head) {
  border-bottom: 1px solid color-mix(in srgb, var(--dw-text) 6%, transparent);
  background: transparent;
}

:deep(.dash-card__head-actions .dw-text-btn) {
  border: 0;
  background: transparent;
  box-shadow: none;
  color: var(--dw-text-secondary);
}

:deep(.dash-card__head-actions .dw-text-btn:hover:not(:disabled)) {
  background: color-mix(in srgb, var(--mp-shell-accent) 8%, transparent);
  color: var(--dw-text);
  box-shadow: none;
}
</style>
