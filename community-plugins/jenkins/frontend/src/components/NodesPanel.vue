<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { invoke } from '../lib/bridge'
import { t, type Locale } from '../lib/i18n'
import type { NodeInfo } from '../lib/types'

const props = withDefaults(
  defineProps<{ locale: Locale; active?: boolean }>(),
  { active: true },
)
const emit = defineEmits<{ toast: [message: string, kind?: 'ok' | 'error'] }>()

const nodes = ref<NodeInfo[]>([])
const booting = ref(false)
const refreshing = ref(false)
const filter = ref<'all' | 'online' | 'busy' | 'offline'>('all')
let inflight = false

function isOffline(n: NodeInfo) {
  return n.offline || n.temporarilyOffline
}

function isBusy(n: NodeInfo) {
  return !isOffline(n) && (!n.idle || n.busyExecutors > 0)
}

function isOnline(n: NodeInfo) {
  return !isOffline(n)
}

const onlineCount = computed(() => nodes.value.filter(isOnline).length)
const busyCount = computed(() => nodes.value.filter(isBusy).length)
const offlineCount = computed(() => nodes.value.filter(isOffline).length)
const totalExec = computed(() => nodes.value.reduce((s, n) => s + (n.numExecutors || 0), 0))
const busyExec = computed(() => nodes.value.reduce((s, n) => s + (n.busyExecutors || 0), 0))

const visible = computed(() => {
  if (filter.value === 'online') return nodes.value.filter(isOnline)
  if (filter.value === 'busy') return nodes.value.filter(isBusy)
  if (filter.value === 'offline') return nodes.value.filter(isOffline)
  return nodes.value
})

function status(n: NodeInfo) {
  if (n.temporarilyOffline) return t(props.locale, 'tempOffline')
  if (n.offline) return t(props.locale, 'offline')
  if (isBusy(n)) return t(props.locale, 'busy')
  return t(props.locale, 'idle')
}

function tone(n: NodeInfo) {
  if (isOffline(n)) return 'bad'
  if (isBusy(n)) return 'run'
  return 'ok'
}

function pct(n: NodeInfo) {
  if (!n.numExecutors) return 0
  return Math.min(100, Math.round((n.busyExecutors / n.numExecutors) * 100))
}

function sameNode(a: NodeInfo, b: NodeInfo) {
  return (
    a.displayName === b.displayName
    && a.offline === b.offline
    && a.temporarilyOffline === b.temporarilyOffline
    && a.idle === b.idle
    && a.numExecutors === b.numExecutors
    && a.busyExecutors === b.busyExecutors
    && a.description === b.description
    && a.offlineCauseReason === b.offlineCauseReason
    && (a.labels || []).join('\0') === (b.labels || []).join('\0')
  )
}

function applyNodes(next: NodeInfo[]) {
  const prev = nodes.value
  if (prev.length === next.length && prev.every((p, i) => sameNode(p, next[i]!))) return
  if (prev.length === next.length && prev.every((p, i) => p.displayName === next[i]?.displayName)) {
    for (let i = 0; i < next.length; i++) Object.assign(prev[i]!, next[i]!)
    return
  }
  nodes.value = next
}

async function refresh() {
  if (inflight) return
  inflight = true
  const first = !nodes.value.length
  if (first) booting.value = true
  else refreshing.value = true
  try {
    const res = await invoke<{ nodes: NodeInfo[] }>('jenkins/nodes/list', {})
    applyNodes(Array.isArray(res?.nodes) ? res.nodes : [])
  } catch (e) {
    emit('toast', e instanceof Error ? e.message : String(e), 'error')
  } finally {
    booting.value = false
    refreshing.value = false
    inflight = false
  }
}

let autoTimer: number | null = null

function schedule() {
  if (autoTimer != null) clearInterval(autoTimer)
  autoTimer = null
  if (props.active === false) return
  autoTimer = window.setInterval(() => {
    if (document.visibilityState === 'hidden') return
    void refresh()
  }, 15000)
}

watch(
  () => props.active,
  (on) => {
    // Parent owns the first fetch when switching tabs.
    if (on) schedule()
    else if (autoTimer != null) {
      clearInterval(autoTimer)
      autoTimer = null
    }
  },
)

onMounted(() => {
  if (props.active !== false) schedule()
})
onBeforeUnmount(() => {
  if (autoTimer != null) clearInterval(autoTimer)
})

defineExpose({ refresh })
</script>

<template>
  <div class="nodes-panel" :class="{ 'is-refreshing': refreshing }">
    <div class="topbar pane-bar nodes-bar">
      <strong>{{ t(locale, 'nodes') }}</strong>
      <span class="jobs-count" :title="String(nodes.length)">{{ nodes.length }}</span>
      <div class="seg nodes-seg">
        <button type="button" class="seg__btn" :class="{ 'is-active': filter === 'all' }" @click="filter = 'all'">
          {{ t(locale, 'filterAll') }}
          <em>{{ nodes.length }}</em>
        </button>
        <button type="button" class="seg__btn" :class="{ 'is-active': filter === 'online' }" @click="filter = 'online'">
          {{ t(locale, 'filterOnline') }}
          <em>{{ onlineCount }}</em>
        </button>
        <button type="button" class="seg__btn" :class="{ 'is-active': filter === 'busy' }" @click="filter = 'busy'">
          {{ t(locale, 'busy') }}
          <em>{{ busyCount }}</em>
        </button>
        <button type="button" class="seg__btn" :class="{ 'is-active': filter === 'offline' }" @click="filter = 'offline'">
          {{ t(locale, 'filterOffline') }}
          <em>{{ offlineCount }}</em>
        </button>
      </div>
      <span class="grow" />
      <span v-if="refreshing" class="nodes-pulse" :title="t(locale, 'refresh')" aria-hidden="true" />
    </div>

    <div class="nodes-body thin-scroll">
      <div v-if="nodes.length" class="nodes-summary">
        <div class="n-kpi">
          <div class="n-kpi__k">{{ t(locale, 'filterOnline') }}</div>
          <div class="n-kpi__v">{{ onlineCount }}</div>
        </div>
        <div class="n-kpi" :class="{ 'is-hot': busyCount > 0 }">
          <div class="n-kpi__k">{{ t(locale, 'busy') }}</div>
          <div class="n-kpi__v">{{ busyCount }}</div>
        </div>
        <div class="n-kpi" :class="{ 'is-bad': offlineCount > 0 }">
          <div class="n-kpi__k">{{ t(locale, 'filterOffline') }}</div>
          <div class="n-kpi__v">{{ offlineCount }}</div>
        </div>
        <div class="n-kpi">
          <div class="n-kpi__k">{{ t(locale, 'executors') }}</div>
          <div class="n-kpi__v">{{ busyExec }}/{{ totalExec || '—' }}</div>
        </div>
      </div>

      <div v-if="booting" class="empty">{{ t(locale, 'loading') }}</div>
      <div v-else-if="!nodes.length" class="nodes-empty">
        <div class="nodes-empty__icon" aria-hidden="true">◈</div>
        <div class="empty__title">{{ t(locale, 'emptyNodes') }}</div>
        <div class="item__meta">{{ t(locale, 'emptyNodesHint') }}</div>
      </div>
      <div v-else-if="!visible.length" class="nodes-empty nodes-empty--soft">
        <div class="empty__title">{{ t(locale, 'emptyFilter') }}</div>
      </div>
      <div v-else class="nodes-list">
        <article
          v-for="n in visible"
          :key="n.displayName"
          class="n-card"
          :class="{
            'is-offline': isOffline(n),
            'is-busy': isBusy(n),
          }"
        >
          <div class="n-card__head">
            <span class="n-card__dot" :class="'dot--' + tone(n)" aria-hidden="true" />
            <div class="n-card__titles">
              <div class="n-card__name" :title="n.displayName">{{ n.displayName }}</div>
              <div v-if="n.offlineCauseReason || n.description" class="n-card__meta">
                {{ n.offlineCauseReason || n.description }}
              </div>
            </div>
            <span class="badge" :class="'badge--' + tone(n)">{{ status(n) }}</span>
          </div>

          <div class="n-card__load">
            <div class="n-card__load-row">
              <span>{{ t(locale, 'utilization') }}</span>
              <strong>{{ pct(n) }}%</strong>
              <span class="n-card__exec">{{ n.busyExecutors }} / {{ n.numExecutors }}</span>
            </div>
            <div class="bar n-card__bar" :title="pct(n) + '%'">
              <i
                :class="{
                  'is-busy': isBusy(n),
                  'is-offline': isOffline(n),
                }"
                :style="{ width: pct(n) + '%' }"
              />
            </div>
          </div>

          <div v-if="n.labels?.length" class="n-card__labels">
            <span v-for="lab in n.labels" :key="lab" class="n-chip">{{ lab }}</span>
          </div>
          <div v-else class="n-card__labels n-card__labels--empty">
            <span class="item__meta">{{ t(locale, 'noLabels') }}</span>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>

<style scoped>
.nodes-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.pane-bar { border: 0; border-bottom: 1px solid var(--line); }
.nodes-bar {
  gap: 8px;
  flex-wrap: wrap;
  min-height: 40px;
}
.nodes-seg .seg__btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.nodes-seg .seg__btn em {
  font-style: normal;
  min-width: 14px;
  padding: 0 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--fg) 8%, transparent);
  font-size: var(--dw-text-2xs);
  font-variant-numeric: tabular-nums;
}
.nodes-seg .seg__btn.is-active em {
  background: color-mix(in srgb, var(--accent) 22%, transparent);
}
.nodes-pulse {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  animation: n-pulse 1s ease-in-out infinite;
  flex: 0 0 auto;
}
@keyframes n-pulse {
  0%, 100% { opacity: .35; transform: scale(.9); }
  50% { opacity: 1; transform: scale(1); }
}

.nodes-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.nodes-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  flex: 0 0 auto;
}
@media (max-width: 720px) {
  .nodes-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.n-kpi {
  border: 1px solid var(--line);
  border-radius: 9px;
  padding: 7px 9px;
  background: linear-gradient(160deg, color-mix(in srgb, var(--panel) 90%, var(--fg)), var(--panel));
}
.n-kpi__k {
  color: var(--muted);
  font-size: var(--dw-text-xs);
}
.n-kpi__v {
  margin-top: 2px;
  font-weight: 700;
  font-size: var(--dw-text-lg);
  font-variant-numeric: tabular-nums;
}
.n-kpi.is-hot .n-kpi__v { color: var(--accent); }
.n-kpi.is-bad .n-kpi__v { color: var(--bad); }

.nodes-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 8px;
  min-height: 120px;
}

.n-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 11px 12px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: linear-gradient(160deg, color-mix(in srgb, var(--panel) 92%, var(--fg)), var(--panel));
  transition: border-color .14s ease;
  min-width: 0;
}
.n-card:hover {
  border-color: color-mix(in srgb, var(--accent) 28%, var(--line));
}
.n-card.is-busy {
  border-color: color-mix(in srgb, var(--accent) 30%, var(--line));
}
.n-card.is-offline {
  border-color: color-mix(in srgb, var(--bad) 30%, var(--line));
  background: linear-gradient(160deg, color-mix(in srgb, var(--bad) 6%, var(--panel)), var(--panel));
}

.n-card__head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.n-card__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 5px;
  flex: 0 0 auto;
  background: var(--muted);
}
.n-card__dot.dot--ok { background: var(--ok); }
.n-card__dot.dot--bad { background: var(--bad); }
.n-card__dot.dot--run {
  background: var(--accent);
  animation: n-pulse 1.1s ease-in-out infinite;
}
.n-card__titles {
  flex: 1;
  min-width: 0;
}
.n-card__name {
  font-weight: 650;
  font-size: var(--dw-font-size);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.n-card__meta {
  margin-top: 2px;
  color: var(--muted);
  font-size: var(--dw-text-xs);
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.n-card__load {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.n-card__load-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  color: var(--muted);
  font-size: var(--dw-text-xs);
}
.n-card__load-row strong {
  color: var(--fg);
  font-variant-numeric: tabular-nums;
}
.n-card__exec {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}
.n-card__bar { height: 5px; min-width: 0; }
.n-card__bar > i.is-busy { background: var(--accent); }
.n-card__bar > i.is-offline {
  background: color-mix(in srgb, var(--bad) 70%, var(--muted));
}

.n-card__labels {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-height: 22px;
}
.n-card__labels--empty { align-items: center; }
.n-chip {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--line) 85%, transparent);
  background: color-mix(in srgb, var(--fg) 4%, transparent);
  color: var(--muted);
  font-size: var(--dw-text-xs);
}

.nodes-empty {
  min-height: 160px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--muted);
  text-align: center;
  padding: 24px 12px;
}
.nodes-empty--soft { min-height: 100px; }
.nodes-empty__icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  margin-bottom: 4px;
  background: color-mix(in srgb, var(--fg) 5%, transparent);
  font-size: var(--dw-font-size);
}
</style>
