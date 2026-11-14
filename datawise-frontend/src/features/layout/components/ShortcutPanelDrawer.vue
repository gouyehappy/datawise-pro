<script setup lang="ts">
import {computed, defineAsyncComponent, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {EmptyState, ProgressBar, SectionHeader, StatusPill} from '@/core/components'
import {usePopoverEscape} from '@/core/composables/usePopoverEscape'
import {DwIcon} from '@/core/icons'
import PillSelect from '@/core/components/PillSelect.vue'
import ToolWindowShell from '@/features/layout/components/ToolWindowShell.vue'
import ExplorerInfoPanel from '@/features/layout/components/ExplorerInfoPanel.vue'
import {usePanelHeaderDrag} from '@/features/dock/composables/usePanelHeaderDrag'
import QueryBookmarksPanel from '@/features/workspace/components/QueryBookmarksPanel.vue'
import SaveBookmarkDialog from '@/features/workspace/components/SaveBookmarkDialog.vue'
import ShareTeamQueryDialog from '@/features/team/components/ShareTeamQueryDialog.vue'
import {ContextMenuHost} from '@/core/context-menu'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useShortcutPanelStore} from '@/features/layout/stores/shortcut-panel-store'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useTeamStore} from '@/features/team/stores/team-store'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {useQueryBookmarkSave} from '@/features/workspace/composables/useQueryBookmarkSave'
import {countQueryBookmarks} from '@/features/workspace/services/query-bookmark.service'
import {readStoredSharedSqlEditorShortcuts} from '@/features/settings/services/sql-editor-shortcuts.service'
import {useMigrationTaskStore} from '@/features/explorer/stores/migration-task-store'
import {useEditorSettingsStore} from '@/features/settings/stores/editor-settings'
import {
    filterSlowSqlLogs,
    isSlowSqlLog,
    parseLogDurationMs,
} from '@/features/workspace/services/slow-query.utils'
import {formatDurationMs} from '@/features/workspace/services/sql-stats.service'
import {openMonitorSessionSql} from '@/features/workspace/services/session-monitor-sql.actions'
import {
    appendSqlLogToPersonalKnowledge,
    buildTeamQueryPayloadFromSqlLog,
} from '@/features/workspace/services/sql-history-knowledge.service'
import {
    buildSqlLogContextMenuItems,
    type SqlLogMenuAction,
} from '@/features/workspace/constants/sql-log-context-menu'
import {UserResource} from '@/features/auth/types/user-resource.types'
import {useResourceWriteGuard} from '@/features/auth/composables/useResourceWriteGuard'
import type {SqlLogEntry} from '@/core/types'
import type {ShareTeamSharedQueryPayload} from '@/core/types'
import {useContextMenu} from '@/core/context-menu'

const MigrationTasksPanel = defineAsyncComponent((() =>
    import.meta.env.VITE_DATAWISE_EDITION === 'standard'
        ? import('@/features/pack/stubs/MigrationTasksStub.vue')
        : import('@/features/workspace/components/MigrationTasksPanel.vue')
) as any)

const SqlMonitorPanel = defineAsyncComponent((() =>
    import.meta.env.VITE_DATAWISE_EDITION === 'standard'
        ? import('@/features/pack/stubs/DataopsMonitorStub.vue')
        : import('@/features/workspace/components/SqlMonitorPanel.vue')
) as any)

withDefaults(
    defineProps<{
      /** Allow dragging the whole shortcut rail via this drawer header. */
      headerDraggable?: boolean
    }>(),
    {headerDraggable: false},
)

const {t} = useI18n()
const layout = useLayoutStore()
const shortcutPanel = useShortcutPanelStore()
const workspace = useWorkspaceStore()
const explorer = useExplorerStore()
const migrationTasks = useMigrationTaskStore()
const editorSettings = useEditorSettingsStore()
const teamStore = useTeamStore()
const {readOnly: knowledgeReadOnly, denyIfReadOnly: denyKnowledgeWrite} = useResourceWriteGuard(UserResource.AiKnowledge)
const {onPointerDown: onDockHeaderPointerDown} = usePanelHeaderDrag('shortcut')

const sqlLogMenu = useContextMenu<SqlLogEntry>()
const teamShareDialogOpen = ref(false)
const teamShareSaving = ref(false)
const teamShareDefaults = ref<ShareTeamSharedQueryPayload | null>(null)
const pendingTeamShareLog = ref<SqlLogEntry | null>(null)

onMounted(() => {
  void teamStore.load().catch(() => {})
})

type SqlLogFilterMode = 'all' | 'slow'

const sqlLogFilterMode = ref<SqlLogFilterMode>('all')

const sqlLogFilterLabels = computed(() => ({
    all: t('shortcut.sqlLogFilter.all'),
    slow: t('shortcut.sqlLogFilter.slowOnly'),
}))

const sqlLogFilterOptions = computed(() => [
    sqlLogFilterLabels.value.all,
    sqlLogFilterLabels.value.slow,
])

const sqlLogFilterModel = computed({
    get: () => sqlLogFilterLabels.value[sqlLogFilterMode.value],
    set: (label: string) => {
        sqlLogFilterMode.value = label === sqlLogFilterLabels.value.slow ? 'slow' : 'all'
    },
})

const slowQueryThresholdMs = computed(() => editorSettings.settings.slowQueryThresholdMs)

const visibleSqlLogs = computed(() => {
    const logs = shortcutPanel.sqlLogs
    if (sqlLogFilterMode.value === 'slow') {
        return filterSlowSqlLogs(logs, slowQueryThresholdMs.value)
    }
    return logs
})

const sqlLogEmptyTitle = computed(() =>
    sqlLogFilterMode.value === 'slow'
        ? t('shortcut.noSlowSqlLogs')
        : t('shortcut.noSqlLogs'),
)

const sqlLogEmptyHint = computed(() =>
    sqlLogFilterMode.value === 'slow'
        ? t('shortcut.emptySlowSqlHint', {threshold: slowQueryThresholdMs.value})
        : t('shortcut.emptySqlHint'),
)

const {
  bookmarkDialogOpen,
  bookmarkSaving,
  bookmarkDefaults,
  openSaveBookmarkDialog,
  onSaveBookmark,
} = useQueryBookmarkSave(() => {
  const tab = workspace.activeTab
  const connectionId = tab?.connectionId
  const connectionName = connectionId ? (explorer.findNode(connectionId)?.label ?? '') : ''
  return {
    name: tab?.type === 'console' ? (tab.title?.trim() || 'Query') : 'Query',
    connectionName,
    sql: tab?.type === 'console' ? (tab.sql ?? '') : 'SELECT 1;',
  }
})

const panel = computed(() => layout.activeShortcutPanel)

const activeConnectionContext = computed(() => {
  const tab = workspace.activeTab
  if (!tab?.connectionId) return {connectionId: undefined, database: undefined}
  return {
    connectionId: tab.connectionId,
    database: tab.database,
  }
})

const title = computed(() => {
  switch (panel.value) {
    case 'info':
      return t('shortcut.objectInfo')
    case 'history':
      return t('shortcut.sqlLog')
    case 'monitor':
      return t('shortcut.monitor.title')
    case 'console':
      return t('shortcut.bookmarks.title')
    case 'export':
      return t('shortcut.exportProgress')
    case 'migration':
      return t('shortcut.migration.title')
    default:
      return ''
  }
})

const subtitle = computed(() => {
  switch (panel.value) {
    case 'info':
      return shortcutPanel.explorerInfo.title || shortcutPanel.explorerInfo.breadcrumb || ''
    case 'history':
      return t('shortcut.itemCount', {count: shortcutPanel.sqlLogs.length})
    case 'monitor': {
      const connectionId = activeConnectionContext.value.connectionId
      if (!connectionId) return t('shortcut.monitor.noConnection')
      const label = explorer.findNode(connectionId)?.label?.trim()
      const database = activeConnectionContext.value.database?.trim()
      if (label && database) return `${label} · ${database}`
      return label || t('shortcut.monitor.subtitle')
    }
    case 'console':
      return t('shortcut.itemCount', {
        count: countQueryBookmarks(
            shortcutPanel.savedConsoles,
            readStoredSharedSqlEditorShortcuts().snippets ?? [],
        ),
      })
    case 'export':
      return t('shortcut.itemCount', {count: shortcutPanel.exportTasks.length})
    case 'migration':
      return migrationTasks.isRunning
          ? t('shortcut.migration.subtitleRunning')
          : t('shortcut.itemCount', {count: migrationTasks.taskList.length})
    default:
      return ''
  }
})

function statusLabel(status: string) {
  return t(`shortcut.status.${status}`)
}

function formatLogDuration(log: { duration: string; durationMs?: number }) {
  return formatDurationMs(parseLogDurationMs(log))
}

function isSlowLog(log: { duration: string; durationMs?: number }) {
  return isSlowSqlLog(log, slowQueryThresholdMs.value)
}

function fileKind(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'sql') return 'sql'
  if (ext === 'csv') return 'csv'
  if (ext === 'json') return 'json'
  return 'file'
}

function closePanel() {
  layout.activeShortcutPanel = null
}

/** AUDIT-02: Escape closes the shortcut tool window (context menu keeps its own dismiss). */
usePopoverEscape(
    () => Boolean(layout.activeShortcutPanel) && !sqlLogMenu.visible.value,
    closePanel,
)

function openSqlLog(sqlOrLog: string | SqlLogEntry) {
  const sql = typeof sqlOrLog === 'string' ? sqlOrLog : sqlOrLog.sql
  layout.setModule('database')
  workspace.openConsole({sql})
}

function resolveSqlLogContext(log: SqlLogEntry) {
  const tab = workspace.activeTab
  const connectionId = log.connectionId ?? tab?.connectionId
  const database = log.database ?? tab?.database
  const connectionName = connectionId ? (explorer.findNode(connectionId)?.label ?? '') : ''
  return {connectionId, connectionName, database}
}

const sqlLogMenuItems = computed(() =>
    buildSqlLogContextMenuItems(t, {
      hasSql: Boolean(sqlLogMenu.target.value?.sql?.trim()),
      teamAvailable: Boolean(teamStore.activeTeamId),
      readOnlyKnowledge: knowledgeReadOnly.value,
    }),
)

function onSqlLogContextMenu(event: MouseEvent, log: SqlLogEntry) {
  event.preventDefault()
  event.stopPropagation()
  sqlLogMenu.open(event, sqlLogMenuItems.value, log)
}

async function archiveSqlLogToPersonalKnowledge(log: SqlLogEntry) {
  if (denyKnowledgeWrite()) return
  try {
    await appendSqlLogToPersonalKnowledge(log, resolveSqlLogContext(log))
  } catch (error) {
    const message = resolveCaughtApiErrorMessage(error, t, 'shortcut.bookmarks.saveFailed')
    layout.showErrorToast(t('shortcut.sqlLogMenu.saveFailed', {message}))
  }
}

function openTeamShareDialog(log: SqlLogEntry) {
  const teamId = teamStore.activeTeamId
  if (!teamId) {
    layout.showErrorToast(t('shortcut.sqlLogMenu.noTeam'))
    return
  }
  pendingTeamShareLog.value = log
  teamShareDefaults.value = buildTeamQueryPayloadFromSqlLog(log, resolveSqlLogContext(log))
  teamShareDialogOpen.value = true
}

async function onTeamShareSave(payload: ShareTeamSharedQueryPayload) {
  const teamId = teamStore.activeTeamId
  if (!teamId) return
  teamShareSaving.value = true
  try {
    await teamStore.shareQuery(teamId, {
      ...payload,
      connectionId: teamShareDefaults.value?.connectionId,
    })
    teamShareDialogOpen.value = false
    pendingTeamShareLog.value = null
  } catch (error) {
    const message = resolveCaughtApiErrorMessage(error, t, 'shortcut.bookmarks.saveFailed')
    layout.showErrorToast(t('shortcut.sqlLogMenu.saveFailed', {message}))
  } finally {
    teamShareSaving.value = false
  }
}

async function onSqlLogMenuSelect(id: string) {
  const log = sqlLogMenu.target.value
  sqlLogMenu.close()
  if (!log) return
  const action = id as SqlLogMenuAction
  if (action === 'open-sql') {
    openSqlLog(log)
    return
  }
  if (action === 'archive-personal') {
    await archiveSqlLogToPersonalKnowledge(log)
    return
  }
  if (action === 'archive-team') {
    openTeamShareDialog(log)
  }
}

function openMonitorSql(sql: string, mode: 'open' | 'explain' = 'open') {
  const tab = workspace.activeTab
  const connectionId = tab?.connectionId ?? activeConnectionContext.value.connectionId
  const database = tab?.database ?? activeConnectionContext.value.database
  const dbType = connectionId ? explorer.findNode(connectionId)?.dbType : undefined
  void openMonitorSessionSql({
    sql,
    mode,
    connectionId,
    database,
    dbType,
  })
}
</script>

<template>
  <ToolWindowShell
      :title="title"
      :subtitle="subtitle"
      :header-draggable="headerDraggable"
      dock-panel="shortcut"
      @collapse="closePanel"
      @header-pointerdown="onDockHeaderPointerDown"
  >
    <ExplorerInfoPanel v-if="panel === 'info'"/>
    <!-- SQL 日志 -->
    <div v-else-if="panel === 'history'" class="sp-body">
      <div class="sp-history-toolbar">
        <SectionHeader :title="t('shortcut.recentSql')" :count="visibleSqlLogs.length"/>
        <PillSelect
            v-model="sqlLogFilterModel"
            size="compact"
            :options="sqlLogFilterOptions"
        />
      </div>

      <EmptyState
          v-if="!visibleSqlLogs.length"
          :title="sqlLogEmptyTitle"
          :hint="sqlLogEmptyHint"
          compact
      >
        <template #icon>
          <DwIcon name="refresh" size="lg" :stroke-width="1.4"/>
        </template>
      </EmptyState>

      <ul v-else class="sp-list">
        <li v-for="log in visibleSqlLogs" :key="log.id">
          <button
              class="sp-card sp-card--clickable"
              :class="{ 'sp-card--slow': isSlowLog(log) }"
              type="button"
              @click="openSqlLog(log)"
              @contextmenu="onSqlLogContextMenu($event, log)"
          >
            <div class="sp-card__top">
              <StatusPill :status="log.status" domain="log">{{ statusLabel(log.status) }}</StatusPill>
              <StatusPill v-if="isSlowLog(log)" variant="warn">{{ t('shortcut.slowQueryBadge') }}</StatusPill>
              <StatusPill v-if="log.teamShared" variant="team">{{ t('shortcut.teamShared') }}</StatusPill>
              <span class="sp-card__hint">{{ t('shortcut.openSql') }}</span>
            </div>
            <pre class="sp-sql">{{ log.sql }}</pre>
            <div class="sp-card__meta">
              <span>{{ log.time }}</span>
              <span class="sp-dot" aria-hidden="true"/>
              <span class="sp-card__duration" :class="{ 'sp-card__duration--slow': isSlowLog(log) }">
                {{ formatLogDuration(log) }}
              </span>
              <template v-if="log.rows">
                <span class="sp-dot" aria-hidden="true"/>
                <span>{{ t('common.rows', {count: log.rows}) }}</span>
              </template>
            </div>
          </button>
        </li>
      </ul>
    </div>

    <!-- SQL 诊断 / 监控 -->
    <div v-else-if="panel === 'monitor'" class="sp-body">
      <SqlMonitorPanel
          :connection-id="activeConnectionContext.connectionId"
          :database="activeConnectionContext.database"
          @open-sql="openMonitorSql($event, 'open')"
      />
    </div>

    <!-- 查询书签 -->
    <div v-else-if="panel === 'console'" class="sp-body">
      <QueryBookmarksPanel @save-bookmark="openSaveBookmarkDialog" />
    </div>

    <!-- 迁移任务 -->
    <div v-else-if="panel === 'migration'" class="sp-body sp-body--fill">
      <MigrationTasksPanel/>
    </div>

    <!-- 导出进度 -->
    <div v-else-if="panel === 'export'" class="sp-body">
      <EmptyState
          v-if="!shortcutPanel.exportTasks.length"
          :title="t('shortcut.noExports')"
          :hint="t('shortcut.emptyExportHint')"
      >
        <template #icon>
          <DwIcon name="export" size="lg" :stroke-width="1.4"/>
        </template>
      </EmptyState>

      <ul v-else class="sp-list">
        <li v-for="task in shortcutPanel.exportTasks" :key="task.id">
          <div class="sp-card sp-card--row" :class="{ 'sp-card--running': task.status === 'running' }">
            <span class="sp-card__icon" :class="`sp-card__icon--${fileKind(task.name)}`" aria-hidden="true">
              <DwIcon name="file" size="sm" :stroke-width="1.6"/>
            </span>
            <span class="sp-card__main">
              <span class="sp-card__title">{{ task.name }}</span>
              <span class="sp-card__sub">{{ task.time }}</span>
              <ProgressBar v-if="task.status === 'running'" size="sm"/>
            </span>
            <StatusPill :status="task.status" domain="export">{{ statusLabel(task.status) }}</StatusPill>
          </div>
        </li>
      </ul>
    </div>
  </ToolWindowShell>

  <SaveBookmarkDialog
      v-model:open="bookmarkDialogOpen"
      :default-name="bookmarkDefaults.name"
      :default-connection-name="bookmarkDefaults.connectionName"
      :default-sql="bookmarkDefaults.sql"
      :saving="bookmarkSaving"
      @save="onSaveBookmark"
  />

  <ShareTeamQueryDialog
      v-model:open="teamShareDialogOpen"
      :saving="teamShareSaving"
      :default-title="teamShareDefaults?.title"
      :default-description="teamShareDefaults?.description"
      :default-connection-name="teamShareDefaults?.connectionName"
      :default-database="teamShareDefaults?.database"
      :default-sql="teamShareDefaults?.sql"
      :default-tags="teamShareDefaults?.tags"
      @save="onTeamShareSave"
  />

  <ContextMenuHost
      :visible="sqlLogMenu.visible.value"
      :x="sqlLogMenu.pos.value.x"
      :y="sqlLogMenu.pos.value.y"
      :items="sqlLogMenuItems"
      @select="onSqlLogMenuSelect"
      @close="sqlLogMenu.close()"
  />
</template>
