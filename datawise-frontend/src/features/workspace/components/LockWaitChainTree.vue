<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import {StatusPill} from '@/core/components'
import SessionKillActions from '@/features/workspace/components/SessionKillActions.vue'
import {
    formatLockWaitDuration,
    truncateLockWaitSql,
    type LockWaitChainNode,
} from '@/features/workspace/services/lock-waits.service'
import type {SessionKillMode} from '@/features/workspace/services/session-kill.service'
import LockWaitChainTree from '@/features/workspace/components/LockWaitChainTree.vue'

defineProps<{
  node: LockWaitChainNode
  depth: number
  canKill: boolean
  killingSessionId?: string | null
}>()

const emit = defineEmits<{
  openSql: [sql: string]
  contextmenuSql: [event: MouseEvent, sql: string]
  kill: [sessionId: string, mode: SessionKillMode]
}>()

const {t} = useI18n()
const i18nPrefix = 'shortcut.lockWaits'

function roleLabel(role: LockWaitChainNode['role']) {
  return role === 'blocker' ? t(`${i18nPrefix}.blocker`) : t(`${i18nPrefix}.waiting`)
}

function openSql(sql: string) {
  emit('openSql', sql)
}

function onKill(mode: SessionKillMode, sessionId: string) {
  emit('kill', sessionId, mode)
}
</script>

<template>
  <div class="lock-waits__node" :style="{ marginLeft: depth ? '14px' : '0' }">
    <div class="lock-waits__card-wrap">
      <button
          class="lock-waits__card"
          type="button"
          :disabled="!node.sql.trim()"
          @click="openSql(node.sql)"
          @contextmenu="emit('contextmenuSql', $event, node.sql)"
      >
        <div class="lock-waits__card-top">
          <StatusPill :variant="node.role === 'blocker' ? 'error' : 'warn'">
            {{ roleLabel(node.role) }}
          </StatusPill>
          <span v-if="node.waitSeconds != null" class="lock-waits__duration">
            {{ formatLockWaitDuration(node.waitSeconds) }}
          </span>
        </div>
        <div class="lock-waits__meta">
          <span>#{{ node.sessionId }}</span>
          <span v-if="node.user">{{ node.user }}</span>
        </div>
        <p v-if="node.sql.trim()" class="lock-waits__sql">{{ truncateLockWaitSql(node.sql) }}</p>
        <p v-else class="lock-waits__sql lock-waits__sql--muted">{{ t(`${i18nPrefix}.noSql`) }}</p>
      </button>
      <SessionKillActions
          :session-id="node.sessionId"
          :can-kill="canKill"
          :killing="killingSessionId === node.sessionId"
          @kill="onKill($event, node.sessionId)"
      />
    </div>
    <LockWaitChainTree
        v-for="child in node.children"
        :key="child.sessionId"
        :node="child"
        :depth="depth + 1"
        :can-kill="canKill"
        :killing-session-id="killingSessionId"
        @open-sql="openSql"
        @contextmenu-sql="(event, sql) => emit('contextmenuSql', event, sql)"
        @kill="(sessionId, mode) => emit('kill', sessionId, mode)"
    />
  </div>
</template>

<style scoped>
.lock-waits__node + .lock-waits__node {
  margin-top: var(--dw-space-3);
}

.lock-waits__card-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap);
}

.lock-waits__card {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-sm);
  width: 100%;
  padding: var(--dw-space-5) var(--dw-space-5);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg);
  text-align: left;
  cursor: pointer;
}

.lock-waits__card:disabled {
  cursor: default;
}

.lock-waits__card:not(:disabled):hover {
  border-color: color-mix(in srgb, var(--dw-primary) 22%, var(--dw-border-light));
  background: color-mix(in srgb, var(--dw-primary) 4%, var(--dw-bg));
}

.lock-waits__card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap);
}

.lock-waits__duration {
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-weight: 600;
}

.lock-waits__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap-sm);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
}

.lock-waits__sql {
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

.lock-waits__sql--muted {
  color: var(--dw-text-muted);
  font-family: inherit;
}
</style>
