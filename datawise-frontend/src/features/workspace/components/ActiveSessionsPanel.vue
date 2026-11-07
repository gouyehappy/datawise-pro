<script setup lang="ts">
import {computed, inject, onMounted, ref, toRef, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import SessionKillActions from '@/features/workspace/components/SessionKillActions.vue'
import {DwButton, DwCheckbox, DwInlineAlert, EmptyState, StatusPill} from '@/core/components'
import DwSelect from '@/core/components/DwSelect.vue'
import type {SelectOption} from '@/core/components/select.types'
import {ContextMenuHost} from '@/core/context-menu'
import {sessionKillKey} from '@/features/workspace/composables/session-kill-context'
import {useMonitorSessionSqlMenu} from '@/features/workspace/composables/useMonitorSessionSqlMenu'
import {sqlApi} from '@/api'
import type {DbType} from '@/core/types'
import {
    formatSessionDuration,
    isActiveSession,
    truncateSessionSql,
    type ActiveSessionList,
} from '@/features/workspace/services/active-sessions.service'
import type {SessionKillMode} from '@/features/workspace/services/session-kill.service'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'

const props = withDefaults(defineProps<{
  connectionId?: string
  database?: string
  dbType?: DbType
  embedded?: boolean
}>(), {
  embedded: false,
})

const emit = defineEmits<{
  openSql: [sql: string]
}>()

const {t} = useI18n()
const entitlement = useEntitlementStore()
const loading = ref(false)
const data = ref<ActiveSessionList | null>(null)
const filterActiveOnly = ref(true)
const sortBy = ref<'duration' | 'user'>('duration')

const i18nPrefix = computed(() => 'shortcut.activeSessions')

/** §1.2: list is free; Kill / lock analysis need DataOps. */
const dataopsPro = computed(
    () => entitlement.mode === 'open' || entitlement.isPackUsable('pack.dataops'),
)

const sortOptions = computed<SelectOption[]>(() => [
  {value: 'duration', label: t(`${i18nPrefix.value}.sortDuration`)},
  {value: 'user', label: t(`${i18nPrefix.value}.sortUser`)},
])
const sessionKill = inject(sessionKillKey)
const canKill = computed(() => sessionKill?.canKill.value ?? false)
const killingSessionId = computed(() => sessionKill?.killingSessionId.value ?? null)

const {
  menuVisible,
  menuPos,
  menuItems,
  onContextMenu,
  onMenuSelect,
  closeMenu,
} = useMonitorSessionSqlMenu({
  connectionId: toRef(props, 'connectionId'),
  database: toRef(props, 'database'),
  dbType: toRef(props, 'dbType'),
})

const sessions = computed(() => {
  const list = data.value?.sessions ?? []
  const filtered = filterActiveOnly.value ? list.filter(isActiveSession) : list
  const sorted = [...filtered]
  if (sortBy.value === 'duration') {
    sorted.sort((a, b) => b.durationSeconds - a.durationSeconds)
  } else {
    sorted.sort((a, b) => a.user.localeCompare(b.user))
  }
  return sorted
})

const canLoad = computed(() => Boolean(props.connectionId?.trim()))

async function loadSessions() {
  if (!canLoad.value) {
    data.value = null
    return
  }
  loading.value = true
  try {
    data.value = await sqlApi.fetchActiveSessions({
      connectionId: props.connectionId!.trim(),
      database: props.database,
    })
  } catch {
    data.value = {sessions: [], supported: false, message: t(`${i18nPrefix.value}.loadFailed`)}
  } finally {
    loading.value = false
  }
}

function unlockDataops() {
  entitlement.guardPack('pack.dataops', 'session.kill')
}

function onKillSession(sessionId: string, mode: SessionKillMode) {
  sessionKill?.requestKill(sessionId, mode, loadSessions)
}

function openSql(sql: string) {
  const trimmed = sql.trim()
  if (!trimmed) return
  emit('openSql', trimmed)
}

onMounted(() => {
  void loadSessions()
})

watch(() => [props.connectionId, props.database], () => {
  void loadSessions()
})
</script>

<template>
  <section class="active-sessions" :class="{ 'active-sessions--embedded': embedded }">
    <header class="active-sessions__head">
      <div>
        <h2 class="active-sessions__title">{{ t(`${i18nPrefix}.title`) }}</h2>
        <p class="active-sessions__hint">
          {{ canLoad ? t(`${i18nPrefix}.subtitle`) : t(`${i18nPrefix}.noConnection`) }}
        </p>
      </div>
      <button
          class="dw-text-btn"
          type="button"
          :disabled="loading || !canLoad"
          @click="loadSessions"
      >
        {{ loading ? t(`${i18nPrefix}.loading`) : t(`${i18nPrefix}.refresh`) }}
      </button>
    </header>

    <div
        v-if="canLoad && !dataopsPro"
        class="active-sessions__free-banner"
        data-testid="active-sessions-free-banner"
    >
      <DwInlineAlert density="banner" variant="info" :message="t(`${i18nPrefix}.freeTierHint`)"/>
      <DwButton variant="secondary" size="sm" type="button" @click="unlockDataops">
        {{ t(`${i18nPrefix}.unlockKill`) }}
      </DwButton>
    </div>

    <div v-if="canLoad" class="active-sessions__toolbar">
      <DwCheckbox v-model="filterActiveOnly" class="active-sessions__filter">
        {{ t(`${i18nPrefix}.activeOnly`) }}
      </DwCheckbox>
      <DwSelect v-model="sortBy" size="sm" :options="sortOptions"/>
    </div>

    <EmptyState v-if="!canLoad" embedded bordered :title="t(`${i18nPrefix}.noConnection`)"/>
    <EmptyState v-else-if="loading && !data" embedded bordered :title="t(`${i18nPrefix}.loading`)"/>
    <EmptyState
        v-else-if="!data?.supported"
        embedded
        bordered
        :title="data?.message || t(`${i18nPrefix}.unsupported`)"
    />
    <EmptyState v-else-if="!sessions.length" embedded bordered :title="t(`${i18nPrefix}.empty`)"/>
    <ul v-else class="active-sessions__list">
      <li v-for="session in sessions" :key="session.sessionId">
        <div class="active-sessions__card">
          <button
              class="active-sessions__card-main"
              type="button"
              :disabled="!session.sql.trim()"
              @click="openSql(session.sql)"
              @contextmenu="onContextMenu($event, session.sql)"
          >
            <div class="active-sessions__card-top">
              <StatusPill variant="primary">{{ session.command || session.state || '—' }}</StatusPill>
              <span class="active-sessions__duration">{{ formatSessionDuration(session.durationSeconds) }}</span>
            </div>
            <div class="active-sessions__meta">
              <span>#{{ session.sessionId }}</span>
              <span>{{ session.user }}</span>
              <span v-if="session.database">{{ session.database }}</span>
            </div>
            <p v-if="session.sql.trim()" class="active-sessions__sql">{{ truncateSessionSql(session.sql) }}</p>
            <p v-else class="active-sessions__sql active-sessions__sql--muted">{{ t(`${i18nPrefix}.noSql`) }}</p>
          </button>
          <SessionKillActions
              :session-id="session.sessionId"
              :can-kill="canKill"
              :killing="killingSessionId === session.sessionId"
              @kill="onKillSession(session.sessionId, $event)"
          />
        </div>
      </li>
    </ul>

    <ContextMenuHost
        :visible="menuVisible"
        :x="menuPos.x"
        :y="menuPos.y"
        :items="menuItems"
        @select="onMenuSelect"
        @close="closeMenu"
    />
  </section>
</template>

<style scoped>
.active-sessions {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-md);
}

.active-sessions__free-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-gap);
}

.active-sessions--embedded .active-sessions__title {
  font-size: var(--dw-text-md);
}

.active-sessions__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--dw-gap-md);
}

.active-sessions__title {
  margin: 0;
  font-size: var(--dw-text-xl);
  font-weight: 600;
}

.active-sessions__hint {
  margin: var(--dw-space-2) 0 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
}



.active-sessions__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap);
}

.active-sessions__filter {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
}

.active-sessions__toolbar :deep(.dw-select) {
  width: auto;
  min-width: 120px;
}

.active-sessions__list {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap);
  margin: 0;
  padding: 0;
  list-style: none;
}

.active-sessions__card {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap);
  padding: var(--dw-space-5) var(--dw-space-5);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg);
}

.active-sessions__card-main {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-sm);
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.active-sessions__card-main:disabled {
  cursor: default;
}

.active-sessions__card-main:not(:disabled):hover .active-sessions__sql {
  background: color-mix(in srgb, var(--dw-primary) 6%, var(--dw-bg-muted));
}

.active-sessions__card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap);
}

.active-sessions__duration {
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-weight: 600;
}

.active-sessions__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap-sm);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
}

.active-sessions__sql {
  margin: 0;
  padding: var(--dw-space-3) var(--dw-space-4);
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg-muted);
  color: var(--dw-text);
  font-family: var(--dw-mono);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
  white-space: pre-wrap;
  word-break: break-word;
}

.active-sessions__sql--muted {
  color: var(--dw-text-muted);
  font-family: inherit;
}
</style>
