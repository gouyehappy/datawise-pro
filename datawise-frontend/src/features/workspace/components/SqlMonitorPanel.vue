<script setup lang="ts">
import {computed, provide, ref, toRef} from 'vue'
import {useI18n} from 'vue-i18n'
import type {DbType} from '@/core/types'
import ActiveSessionsPanel from '@/features/workspace/components/ActiveSessionsPanel.vue'
import LockWaitsPanel from '@/features/workspace/components/LockWaitsPanel.vue'
import SlowSqlStatsPanel from '@/features/workspace/components/SlowSqlStatsPanel.vue'
import PrivilegesPanel from '@/features/workspace/components/PrivilegesPanel.vue'
import ObjectStoragePanel from '@/features/workspace/components/ObjectStoragePanel.vue'
import SessionKillConfirmDialog from '@/features/workspace/components/SessionKillConfirmDialog.vue'
import {sessionKillKey} from '@/features/workspace/composables/session-kill-context'
import {useSessionKill} from '@/features/workspace/composables/useSessionKill'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useConnectionCapabilities} from '@/features/datasource/composables/useConnectionCapabilities'
import {useEditorSettingsStore} from '@/features/settings/stores/editor-settings'
import {
    supportsAdminPrivileges,
    supportsAdminStorage,
} from '@/features/workspace/services/admin-diagnosis.service'

type MonitorTab = 'sessions' | 'locks' | 'slowSql' | 'privileges' | 'storage'

const props = withDefaults(defineProps<{
  connectionId?: string
  database?: string
}>(), {})

const emit = defineEmits<{
  openSql: [sql: string]
}>()

const {t} = useI18n()
const explorer = useExplorerStore()
const editorSettings = useEditorSettingsStore()
const activeTab = ref<MonitorTab>('sessions')

const dbType = computed(() => {
  const id = props.connectionId?.trim()
  if (!id) return undefined
  return explorer.findNode(id)?.dbType as DbType | undefined
})

const {caps, hint} = useConnectionCapabilities(dbType)
const canPrivileges = computed(() => supportsAdminPrivileges(dbType.value))
const canStorage = computed(() => supportsAdminStorage(dbType.value))

const sessionKill = useSessionKill(
    toRef(props, 'connectionId'),
    toRef(props, 'database'),
    dbType,
)
provide(sessionKillKey, sessionKill)

const {
  confirmOpen,
  pendingKill,
  killingSessionId,
  confirmKill,
  cancelKill,
} = sessionKill

function selectTab(tab: MonitorTab) {
  if (tab === 'sessions' && !caps.value.sessionMonitor) return
  if (tab === 'locks' && !caps.value.lockMonitor) return
  if (tab === 'privileges' && !canPrivileges.value) return
  if (tab === 'storage' && !canStorage.value) return
  activeTab.value = tab
}
</script>

<template>
  <div class="sql-monitor">
    <div class="sql-monitor__tabs" role="tablist">
      <button
          class="sql-monitor__tab"
          :class="{ 'sql-monitor__tab--active': activeTab === 'sessions' }"
          type="button"
          role="tab"
          :aria-selected="activeTab === 'sessions'"
          :disabled="!caps.sessionMonitor"
          :title="!caps.sessionMonitor ? hint('sessionMonitor') : undefined"
          @click="selectTab('sessions')"
      >
        {{ t('shortcut.monitor.tabs.sessions') }}
      </button>
      <button
          class="sql-monitor__tab"
          :class="{ 'sql-monitor__tab--active': activeTab === 'locks' }"
          type="button"
          role="tab"
          :aria-selected="activeTab === 'locks'"
          :disabled="!caps.lockMonitor"
          :title="!caps.lockMonitor ? hint('lockMonitor') : undefined"
          @click="selectTab('locks')"
      >
        {{ t('shortcut.monitor.tabs.locks') }}
      </button>
      <button
          class="sql-monitor__tab"
          :class="{ 'sql-monitor__tab--active': activeTab === 'slowSql' }"
          type="button"
          role="tab"
          :aria-selected="activeTab === 'slowSql'"
          @click="selectTab('slowSql')"
      >
        {{ t('shortcut.monitor.tabs.slowSql') }}
      </button>
      <button
          class="sql-monitor__tab"
          :class="{ 'sql-monitor__tab--active': activeTab === 'privileges' }"
          type="button"
          role="tab"
          :aria-selected="activeTab === 'privileges'"
          :disabled="!canPrivileges"
          :title="!canPrivileges ? t('shortcut.adminDiagnosis.unsupported') : undefined"
          @click="selectTab('privileges')"
      >
        {{ t('shortcut.monitor.tabs.privileges') }}
      </button>
      <button
          class="sql-monitor__tab"
          :class="{ 'sql-monitor__tab--active': activeTab === 'storage' }"
          type="button"
          role="tab"
          :aria-selected="activeTab === 'storage'"
          :disabled="!canStorage"
          :title="!canStorage ? t('shortcut.adminDiagnosis.unsupported') : undefined"
          @click="selectTab('storage')"
      >
        {{ t('shortcut.monitor.tabs.storage') }}
      </button>
    </div>

    <div class="sql-monitor__pane" role="tabpanel">
      <ActiveSessionsPanel
          v-if="activeTab === 'sessions'"
          embedded
          :connection-id="connectionId"
          :database="database"
          :db-type="dbType"
          @open-sql="emit('openSql', $event)"
      />
      <LockWaitsPanel
          v-else-if="activeTab === 'locks'"
          embedded
          :connection-id="connectionId"
          :database="database"
          :db-type="dbType"
          @open-sql="emit('openSql', $event)"
      />
      <SlowSqlStatsPanel
          v-else-if="activeTab === 'slowSql'"
          embedded
          :connection-id="connectionId"
          :slow-threshold-ms="editorSettings.settings.slowQueryThresholdMs"
          @open-sql="emit('openSql', $event)"
      />
      <PrivilegesPanel
          v-else-if="activeTab === 'privileges'"
          embedded
          :connection-id="connectionId"
          :database="database"
          :db-type="dbType"
          @open-sql="emit('openSql', $event)"
      />
      <ObjectStoragePanel
          v-else
          embedded
          :connection-id="connectionId"
          :database="database"
          :db-type="dbType"
          @open-sql="emit('openSql', $event)"
      />
    </div>

    <SessionKillConfirmDialog
        :open="confirmOpen"
        :session-id="pendingKill?.sessionId ?? ''"
        :mode="pendingKill?.mode ?? 'query'"
        :loading="Boolean(killingSessionId)"
        @confirm="confirmKill()"
        @cancel="cancelKill()"
    />
  </div>
</template>

<style scoped>
.sql-monitor {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-md);
}

.sql-monitor__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-tab-gap);
  padding: 0 var(--dw-space-2);
  border: none;
  border-bottom: 1px solid var(--dw-tab-bar-border);
  border-radius: 0;
  background: var(--dw-tab-bar-bg);
}

.sql-monitor__tab {
  flex: 1 1 auto;
  min-width: 0;
  padding: var(--dw-space-3) var(--dw-space-3);
  border-radius: var(--dw-tab-pill-radius);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  cursor: pointer;
}

.sql-monitor__tab:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.sql-monitor__tab--active {
  font-weight: 700;
}

.sql-monitor__pane {
  min-height: 0;
}
</style>
