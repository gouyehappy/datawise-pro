<script setup lang="ts">
import type {SqlLogEntry, WorkspaceTab} from '@/core/types'
import type {TeamAuditLog, TeamSharedAiSessionSummary} from '@/core/types'
import type {DashboardConnectionHealthRow, DashboardRuntimeOverview} from '@/features/dashboard/services/dashboard-connection-runtime.service'
import type {DashboardQuickActionId} from '@/features/dashboard/services/dashboard-summary.service'
import type {DashboardWidgetColumn, DashboardWidgetId} from '@/features/dashboard/services/dashboard-widget.service'
import DashboardQuickActionsWidget from '@/features/dashboard/components/widgets/DashboardQuickActionsWidget.vue'
import DashboardConnectionHealthWidget from '@/features/dashboard/components/widgets/DashboardConnectionHealthWidget.vue'
import DashboardRecentSqlWidget from '@/features/dashboard/components/widgets/DashboardRecentSqlWidget.vue'
import DashboardRecentAnalysisWidget from '@/features/dashboard/components/widgets/DashboardRecentAnalysisWidget.vue'
import DashboardOpenTabsWidget from '@/features/dashboard/components/widgets/DashboardOpenTabsWidget.vue'
import DashboardSavedConsolesWidget from '@/features/dashboard/components/widgets/DashboardSavedConsolesWidget.vue'
import DashboardEnabledPluginsWidget from '@/features/dashboard/components/widgets/DashboardEnabledPluginsWidget.vue'
import DashboardTeamActivityWidget from '@/features/dashboard/components/widgets/DashboardTeamActivityWidget.vue'
import DashboardOnCallConnectionsWidget from '@/features/dashboard/components/widgets/DashboardOnCallConnectionsWidget.vue'
import type {OnCallConnectionRef} from '@/features/team/services/team-on-call-pack.service'
import type {PluginPresetId} from '@/features/plugin/services/plugin-preset.service'

interface SavedConsoleItem {
  id: string
  name: string
  connectionName: string
  updatedAt: string
  sql?: string
}

interface PluginItem {
  id: string
  name: string
  version: string
}

const props = defineProps<{
  widgetId: DashboardWidgetId
  column: DashboardWidgetColumn
  index: number
  editMode: boolean
  isDragging: boolean
  isDropTarget: boolean
  hasOpenTabs: boolean
  connections: DashboardConnectionHealthRow[]
  healthSummary: { ok: number; error: number; unknown: number }
  healthChecking: boolean
  healthCheckedAt: number | null
  runtimeOverview: DashboardRuntimeOverview
  runtimeLoading: boolean
  recentLogs: SqlLogEntry[]
  recentConsoles: SavedConsoleItem[]
  openTabs: WorkspaceTab[]
  activeTabId: string | null
  enabledPlugins: PluginItem[]
  referencePresetId: PluginPresetId
  referencePresetConflictCount: number
  teamWidgetsLoading: boolean
  hasActiveTeam: boolean
  auditLogs: TeamAuditLog[]
  sharedAiSessions: TeamSharedAiSessionSummary[]
  onCallConnections: OnCallConnectionRef[]
  activeTeamName: string
}>()

const emit = defineEmits<{
  quickAction: [id: DashboardQuickActionId]
  refreshHealth: []
  openHealthSettings: []
  openDatabase: []
  openLog: [sql: string]
  openTeam: []
  openOnCallConnection: [connectionId: string]
  openTab: [tabId: string]
  openConsole: [item: SavedConsoleItem]
  openPlugins: []
  focusPlugin: [id: string]
  openPresetDiff: []
  alignReferencePreset: []
  dragStart: [event: DragEvent]
  dragOver: []
  drop: []
  dragEnd: []
}>()
</script>

<template>
  <DashboardQuickActionsWidget
      v-if="widgetId === 'quickActions'"
      :edit-mode="editMode"
      :is-dragging="isDragging"
      :is-drop-target="isDropTarget"
      :has-open-tabs="hasOpenTabs"
      @action="emit('quickAction', $event)"
      @drag-start="emit('dragStart', $event)"
      @drag-over="emit('dragOver')"
      @drop="emit('drop')"
      @drag-end="emit('dragEnd')"
  />
  <DashboardConnectionHealthWidget
      v-else-if="widgetId === 'connectionHealth'"
      :edit-mode="editMode"
      :is-dragging="isDragging"
      :is-drop-target="isDropTarget"
      :connections="connections"
      :health-summary="healthSummary"
      :health-checking="healthChecking"
      :health-checked-at="healthCheckedAt"
      :runtime-overview="runtimeOverview"
      :runtime-loading="runtimeLoading"
      @refresh="emit('refreshHealth')"
      @open-settings="emit('openHealthSettings')"
      @open-database="emit('openDatabase')"
      @drag-start="emit('dragStart', $event)"
      @drag-over="emit('dragOver')"
      @drop="emit('drop')"
      @drag-end="emit('dragEnd')"
  />
  <DashboardOnCallConnectionsWidget
      v-else-if="widgetId === 'onCallConnections'"
      :edit-mode="editMode"
      :is-dragging="isDragging"
      :is-drop-target="isDropTarget"
      :has-team="hasActiveTeam"
      :team-name="activeTeamName"
      :connections="onCallConnections"
      @open-connection="emit('openOnCallConnection', $event)"
      @open-team="emit('openTeam')"
      @drag-start="emit('dragStart', $event)"
      @drag-over="emit('dragOver')"
      @drop="emit('drop')"
      @drag-end="emit('dragEnd')"
  />
  <DashboardRecentSqlWidget
      v-else-if="widgetId === 'recentSql'"
      :edit-mode="editMode"
      :is-dragging="isDragging"
      :is-drop-target="isDropTarget"
      :logs="recentLogs"
      @open-log="emit('openLog', $event)"
      @drag-start="emit('dragStart', $event)"
      @drag-over="emit('dragOver')"
      @drop="emit('drop')"
      @drag-end="emit('dragEnd')"
  />
  <DashboardRecentAnalysisWidget
      v-else-if="widgetId === 'recentAnalysis'"
      :edit-mode="editMode"
      :is-dragging="isDragging"
      :is-drop-target="isDropTarget"
      :loading="teamWidgetsLoading"
      :has-team="hasActiveTeam"
      :sessions="sharedAiSessions"
      @open-team="emit('openTeam')"
      @drag-start="emit('dragStart', $event)"
      @drag-over="emit('dragOver')"
      @drop="emit('drop')"
      @drag-end="emit('dragEnd')"
  />
  <DashboardOpenTabsWidget
      v-else-if="widgetId === 'openTabs'"
      :edit-mode="editMode"
      :is-dragging="isDragging"
      :is-drop-target="isDropTarget"
      :tabs="openTabs"
      :active-tab-id="activeTabId"
      @open-tab="emit('openTab', $event)"
      @drag-start="emit('dragStart', $event)"
      @drag-over="emit('dragOver')"
      @drop="emit('drop')"
      @drag-end="emit('dragEnd')"
  />
  <DashboardSavedConsolesWidget
      v-else-if="widgetId === 'savedConsoles'"
      :edit-mode="editMode"
      :is-dragging="isDragging"
      :is-drop-target="isDropTarget"
      :consoles="recentConsoles"
      @open-console="emit('openConsole', $event)"
      @drag-start="emit('dragStart', $event)"
      @drag-over="emit('dragOver')"
      @drop="emit('drop')"
      @drag-end="emit('dragEnd')"
  />
  <DashboardEnabledPluginsWidget
      v-else-if="widgetId === 'enabledPlugins'"
      :edit-mode="editMode"
      :is-dragging="isDragging"
      :is-drop-target="isDropTarget"
      :plugins="enabledPlugins"
      :reference-preset-id="referencePresetId"
      :reference-preset-conflict-count="referencePresetConflictCount"
      @open-plugins="emit('openPlugins')"
      @open-preset-diff="emit('openPresetDiff')"
      @align-reference-preset="emit('alignReferencePreset')"
      @focus-plugin="emit('focusPlugin', $event)"
      @drag-start="emit('dragStart', $event)"
      @drag-over="emit('dragOver')"
      @drop="emit('drop')"
      @drag-end="emit('dragEnd')"
  />
  <DashboardTeamActivityWidget
      v-else-if="widgetId === 'teamActivity'"
      :edit-mode="editMode"
      :is-dragging="isDragging"
      :is-drop-target="isDropTarget"
      :loading="teamWidgetsLoading"
      :has-team="hasActiveTeam"
      :logs="auditLogs"
      @open-team="emit('openTeam')"
      @drag-start="emit('dragStart', $event)"
      @drag-over="emit('dragOver')"
      @drop="emit('drop')"
      @drag-end="emit('dragEnd')"
  />
</template>
