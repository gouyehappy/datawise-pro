<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { invoke } from '../lib/bridge'
import { formatRelative, formatTime } from '../lib/format'
import { t, type Locale } from '../lib/i18n'
import type { QueueItem } from '../lib/types'

const props = defineProps<{ locale: Locale; active?: boolean }>()
const emit = defineEmits<{
  toast: [message: string, kind?: 'ok' | 'error']
  openJob: [fullName: string]
  count: [n: number]
}>()

const items = ref<QueueItem[]>([])
const booting = ref(false)
const refreshing = ref(false)
const auto = ref(true)
const filter = ref<'all' | 'blocked' | 'waiting'>('all')
let timer: number | null = null
let inflight = false

const blockedCount = computed(() => items.value.filter((q) => q.blocked).length)
const waitingCount = computed(() => items.value.filter((q) => !q.blocked).length)

const visible = computed(() => {
  if (filter.value === 'blocked') return items.value.filter((q) => q.blocked)
  if (filter.value === 'waiting') return items.value.filter((q) => !q.blocked)
  return items.value
})

function statusLabel(q: QueueItem) {
  if (q.blocked) return t(props.locale, 'blocked')
  if (q.buildable) return t(props.locale, 'waiting')
  return t(props.locale, 'queued')
}

function statusTone(q: QueueItem) {
  if (q.blocked) return 'warn'
  if (q.buildable) return 'run'
  return 'muted'
}

function sameItem(a: QueueItem, b: QueueItem) {
  return (
    a.id === b.id
    && a.blocked === b.blocked
    && a.buildable === b.buildable
    && a.why === b.why
    && a.taskName === b.taskName
    && a.taskUrl === b.taskUrl
    && a.inQueueSince === b.inQueueSince
  )
}

function applyItems(next: QueueItem[]) {
  const prev = items.value
  if (prev.length === next.length && prev.every((p, i) => sameItem(p, next[i]!))) {
    emit('count', prev.length)
    return
  }
  if (prev.length === next.length && prev.every((p, i) => p.id === next[i]?.id)) {
    for (let i = 0; i < next.length; i++) Object.assign(prev[i]!, next[i]!)
    emit('count', prev.length)
    return
  }
  items.value = next
  emit('count', next.length)
}

async function refresh() {
  if (inflight) return
  inflight = true
  const first = !items.value.length
  if (first) booting.value = true
  else refreshing.value = true
  try {
    const res = await invoke<{ items: QueueItem[] }>('jenkins/queue/list', {})
    applyItems(Array.isArray(res.items) ? res.items : [])
  } catch (e) {
    emit('toast', e instanceof Error ? e.message : String(e), 'error')
  } finally {
    booting.value = false
    refreshing.value = false
    inflight = false
  }
}

function schedule() {
  if (timer != null) clearInterval(timer)
  timer = null
  if (!auto.value || props.active === false) return
  timer = window.setInterval(() => {
    if (document.visibilityState === 'hidden') return
    void refresh()
  }, 8000)
}

watch(
  () => props.active,
  (on) => {
    if (on) schedule()
    else if (timer != null) {
      clearInterval(timer)
      timer = null
    }
  },
)

onMounted(() => {
  if (props.active !== false) schedule()
})
onBeforeUnmount(() => { if (timer != null) clearInterval(timer) })
defineExpose({ refresh })
</script>

<template>
  <div class="queue-panel" :class="{ 'is-refreshing': refreshing }">
    <div class="topbar pane-bar queue-bar">
      <strong>{{ t(locale, 'queue') }}</strong>
      <span class="jobs-count" :class="{ 'is-hot': items.length > 0 }" :title="String(items.length)">
        {{ items.length }}
      </span>
      <div class="seg queue-seg">
        <button
          type="button"
          class="seg__btn"
          :class="{ 'is-active': filter === 'all' }"
          @click="filter = 'all'"
        >
          {{ t(locale, 'filterAll') }}
          <em>{{ items.length }}</em>
        </button>
        <button
          type="button"
          class="seg__btn"
          :class="{ 'is-active': filter === 'waiting' }"
          @click="filter = 'waiting'"
        >
          {{ t(locale, 'waiting') }}
          <em>{{ waitingCount }}</em>
        </button>
        <button
          type="button"
          class="seg__btn"
          :class="{ 'is-active': filter === 'blocked' }"
          @click="filter = 'blocked'"
        >
          {{ t(locale, 'blocked') }}
          <em>{{ blockedCount }}</em>
        </button>
      </div>
      <label class="switch">
        <input v-model="auto" type="checkbox" @change="schedule" />
        {{ t(locale, 'autoRefresh') }}
      </label>
      <span class="grow" />
      <span v-if="refreshing" class="queue-pulse" :title="t(locale, 'refresh')" aria-hidden="true" />
    </div>

    <div class="queue-body thin-scroll">
      <div v-if="booting" class="empty">{{ t(locale, 'loading') }}</div>
      <div v-else-if="!items.length" class="queue-empty">
        <div class="queue-empty__icon" aria-hidden="true">☰</div>
        <div class="empty__title">{{ t(locale, 'emptyQueue') }}</div>
        <div class="item__meta">{{ t(locale, 'emptyQueueHint') }}</div>
      </div>
      <div v-else-if="!visible.length" class="queue-empty queue-empty--soft">
        <div class="empty__title">{{ t(locale, 'emptyFilter') }}</div>
      </div>
      <div v-else class="queue-list">
        <article
          v-for="q in visible"
          :key="q.id"
          class="q-card"
          :class="{ 'is-blocked': q.blocked }"
        >
          <div class="q-card__main">
            <button
              v-if="q.taskName"
              type="button"
              class="q-card__title"
              :title="q.taskName"
              @click="emit('openJob', q.taskName!)"
            >
              {{ q.taskName }}
            </button>
            <div v-else class="q-card__title q-card__title--plain">#{{ q.id }}</div>
            <div class="q-card__why" :title="q.why || ''">{{ q.why || '—' }}</div>
          </div>
          <div class="q-card__side">
            <span class="badge" :class="'badge--' + statusTone(q)">{{ statusLabel(q) }}</span>
            <div class="q-card__wait" :title="formatTime(q.inQueueSince)">
              {{ formatRelative(q.inQueueSince, locale) }}
            </div>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>

<style scoped>
.queue-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.pane-bar { border: 0; border-bottom: 1px solid var(--line); }
.queue-bar {
  gap: 8px;
  flex-wrap: wrap;
  min-height: 40px;
}
.queue-seg {
  margin-left: 2px;
}
.queue-seg .seg__btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.queue-seg .seg__btn em {
  font-style: normal;
  min-width: 14px;
  padding: 0 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--fg) 8%, transparent);
  font-size: var(--dw-text-2xs);
  font-variant-numeric: tabular-nums;
}
.queue-seg .seg__btn.is-active em {
  background: color-mix(in srgb, var(--accent) 22%, transparent);
}
.jobs-count.is-hot {
  background: color-mix(in srgb, var(--accent) 22%, transparent);
  color: var(--fg);
}
.queue-pulse {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  animation: q-pulse 1s ease-in-out infinite;
  flex: 0 0 auto;
}
@keyframes q-pulse {
  0%, 100% { opacity: .35; transform: scale(.9); }
  50% { opacity: 1; transform: scale(1); }
}

.queue-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px;
}
.queue-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  /* Keep height stable across soft refreshes */
  min-height: 120px;
}

.q-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background:
    linear-gradient(160deg, color-mix(in srgb, var(--panel) 92%, var(--fg)), var(--panel));
  transition: border-color .14s ease, background .14s ease;
}
.q-card:hover {
  border-color: color-mix(in srgb, var(--accent) 28%, var(--line));
}
.q-card.is-blocked {
  border-color: color-mix(in srgb, var(--warn) 32%, var(--line));
  background:
    linear-gradient(160deg, color-mix(in srgb, var(--warn) 7%, var(--panel)), var(--panel));
}
.q-card__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.q-card__title {
  border: 0;
  background: transparent;
  padding: 0;
  text-align: left;
  color: var(--fg);
  font-weight: 600;
  font-size: var(--dw-font-size);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.q-card__title:hover { color: var(--accent); }
.q-card__title--plain { cursor: default; }
.q-card__why {
  color: var(--muted);
  font-size: var(--dw-text-xs);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
  min-height: 1.4em;
}
.q-card__side {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  padding-top: 1px;
}
.q-card__wait {
  color: var(--muted);
  font-size: var(--dw-text-xs);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.queue-empty {
  min-height: 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--muted);
  text-align: center;
  padding: 24px 12px;
}
.queue-empty--soft { min-height: 120px; }
.queue-empty__icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  margin-bottom: 4px;
  background: color-mix(in srgb, var(--fg) 5%, transparent);
  color: color-mix(in srgb, var(--muted) 80%, var(--fg));
  font-size: var(--dw-font-size);
}
</style>
