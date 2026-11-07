<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { invoke } from '../lib/bridge'
import { formatRelative, statusFromJob } from '../lib/format'
import { statusLabel, t, type Locale } from '../lib/i18n'
import type { Overview, JobSummary } from '../lib/types'
import PinButton from './PinButton.vue'

const props = defineProps<{
  locale: Locale
  pins: string[]
  active?: boolean
}>()

const emit = defineEmits<{
  toast: [message: string, kind?: 'ok' | 'error']
  openJob: [fullName: string]
  togglePin: [fullName: string]
  goQueue: []
  meta: [data: Overview]
}>()

const data = ref<Overview | null>(null)
const loading = ref(false)
const refreshing = ref(false)
const auto = ref(true)
let timer: number | null = null
let inflight = false

function patchByKey<T>(prev: T[], next: T[], keyOf: (x: T) => string | number): T[] {
  if (prev.length === next.length && prev.every((p, i) => keyOf(p) === keyOf(next[i]!))) {
    for (let i = 0; i < next.length; i++) Object.assign(prev[i] as object, next[i] as object)
    return prev
  }
  return next
}

function applyOverview(next: Overview): Overview {
  const prev = data.value
  if (!prev) {
    data.value = next
    return next
  }
  prev.baseUrl = next.baseUrl
  prev.readOnly = next.readOnly
  prev.downloadDir = next.downloadDir
  prev.version = next.version
  prev.nodeName = next.nodeName
  prev.mode = next.mode
  prev.numExecutors = next.numExecutors
  prev.quietingDown = next.quietingDown
  prev.queueCount = next.queueCount
  prev.offlineNodes = next.offlineNodes
  prev.busyExecutors = next.busyExecutors
  prev.totalExecutors = next.totalExecutors
  prev.building = patchByKey(prev.building || [], next.building || [], (j) => j.fullName)
  prev.failing = patchByKey(prev.failing || [], next.failing || [], (j) => j.fullName)
  prev.pinned = patchByKey(prev.pinned || [], next.pinned || [], (j) => j.fullName)
  prev.queue = patchByKey(prev.queue || [], next.queue || [], (q) => q.id)
  return prev
}

async function refresh(): Promise<Overview | null> {
  if (inflight) return data.value
  inflight = true
  if (!data.value) loading.value = true
  else refreshing.value = true
  try {
    const next = await invoke<Overview>('jenkins/overview', {
      pins: props.pins.slice(0, 40),
    })
    const snap = applyOverview(next)
    emit('meta', snap)
    return snap
  } catch (e) {
    emit('toast', e instanceof Error ? e.message : String(e), 'error')
    return data.value
  } finally {
    loading.value = false
    refreshing.value = false
    inflight = false
  }
}

function snapshot() {
  return data.value
}

function jobLabel(job: JobSummary) {
  const s = statusFromJob(job.color, job.lastBuildResult, job.lastBuildBuilding)
  return statusLabel(props.locale, s.key)
}

function tone(job: JobSummary) {
  return statusFromJob(job.color, job.lastBuildResult, job.lastBuildBuilding).tone
}

function isPinned(name: string) {
  return props.pins.includes(name)
}

const pinLookup = computed(() => {
  const map = new Map<string, JobSummary>()
  for (const j of data.value?.pinned || []) map.set(j.fullName, j)
  for (const j of data.value?.building || []) map.set(j.fullName, j)
  for (const j of data.value?.failing || []) map.set(j.fullName, j)
  return map
})

const pinCards = computed(() =>
  props.pins.map((name) => ({
    name,
    job: pinLookup.value.get(name) || null,
  })),
)

function pinMeta(job: JobSummary | null) {
  if (!job) return t(props.locale, 'goJobs')
  const bits = [
    job.lastBuildNumber ? `#${job.lastBuildNumber}` : '',
    jobLabel(job),
    formatRelative(job.lastBuildTimestamp, props.locale),
  ].filter(Boolean)
  return bits.join(' · ')
}

function schedule() {
  if (timer != null) clearInterval(timer)
  timer = null
  if (!auto.value || props.active === false) return
  timer = window.setInterval(() => {
    if (document.visibilityState === 'hidden') return
    void refresh()
  }, 12000)
}

watch(
  () => props.active,
  (on) => {
    if (on) {
      // Parent (App.setNav / refreshActive) owns the first fetch — avoid double overview RPC.
      schedule()
    } else {
      if (timer != null) clearInterval(timer)
      timer = null
    }
  },
)

watch(
  () => props.pins.join('\0'),
  () => {
    if (props.active !== false && data.value) void refresh()
  },
)

onMounted(() => {
  if (props.active !== false) schedule()
})
onBeforeUnmount(() => { if (timer != null) clearInterval(timer) })
defineExpose({ refresh, snapshot })
</script>

<template>
  <div class="overview" :class="{ 'is-refreshing': refreshing }">
    <div class="topbar overview__bar">
      <strong>{{ t(locale, 'overview') }}</strong>
      <label class="switch">
        <input v-model="auto" type="checkbox" @change="schedule" />
        {{ t(locale, 'autoRefresh') }}
      </label>
      <span class="grow" />
      <span v-if="refreshing" class="ov-pulse" :title="t(locale, 'refresh')" aria-hidden="true" />
    </div>

    <div v-if="loading && !data" class="empty">{{ t(locale, 'loading') }}</div>
    <template v-else-if="data">
      <div class="kpis">
        <button type="button" class="kpi is-hot" @click="emit('goQueue')">
          <div class="kpi__label">{{ t(locale, 'kpiQueue') }}</div>
          <div class="kpi__value">{{ data.queueCount }}</div>
        </button>
        <div class="kpi">
          <div class="kpi__label">{{ t(locale, 'kpiBusy') }}</div>
          <div class="kpi__value">{{ data.busyExecutors }}/{{ data.totalExecutors || '—' }}</div>
        </div>
        <div class="kpi" :class="{ 'is-bad': data.offlineNodes > 0 }">
          <div class="kpi__label">{{ t(locale, 'kpiOffline') }}</div>
          <div class="kpi__value">{{ data.offlineNodes }}</div>
        </div>
        <div class="kpi" :class="{ 'is-warn': data.quietingDown }">
          <div class="kpi__label">{{ t(locale, 'kpiQuiet') }}</div>
          <div class="kpi__value">{{ data.quietingDown ? t(locale, 'yes') : t(locale, 'no') }}</div>
        </div>
      </div>

      <div class="overview__grid">
        <div class="section">
          <div class="section__head">
            <span>{{ t(locale, 'sectionPins') }}</span>
            <button
              v-if="pins.length"
              type="button"
              class="btn btn--sm btn--ghost"
              @click="emit('openJob', pins[0])"
            >{{ t(locale, 'goJobs') }} →</button>
          </div>
          <div v-if="!pins.length" class="empty empty--soft">{{ t(locale, 'emptyPins') }}</div>
          <div v-else class="cards cards--dense">
            <div v-for="card in pinCards" :key="card.name" class="card card--row">
              <PinButton :active="true" size="sm" :title="t(locale, 'unpin')" @click="emit('togglePin', card.name)" />
              <span
                v-if="card.job"
                class="dot"
                :class="'dot--' + tone(card.job)"
                :title="jobLabel(card.job)"
              />
              <span v-else class="dot dot--muted" />
              <button type="button" class="card__hit" @click="emit('openJob', card.name)">
                <div class="card__title">{{ card.name }}</div>
                <div class="card__meta">{{ pinMeta(card.job) }}</div>
              </button>
              <span
                v-if="card.job"
                class="badge"
                :class="'badge--' + tone(card.job)"
              >{{ jobLabel(card.job) }}</span>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section__head">{{ t(locale, 'sectionBuilding') }}</div>
          <div v-if="!data.building.length" class="empty empty--soft">—</div>
          <div v-else class="cards cards--dense">
            <div v-for="job in data.building" :key="job.fullName" class="card card--row">
              <PinButton
                :active="isPinned(job.fullName)"
                size="sm"
                :title="isPinned(job.fullName) ? t(locale, 'unpin') : t(locale, 'pin')"
                @click="emit('togglePin', job.fullName)"
              />
              <button type="button" class="card__hit" @click="emit('openJob', job.fullName)">
                <div class="card__title">{{ job.fullName }}</div>
                <div class="card__meta">#{{ job.lastBuildNumber || '—' }} · {{ jobLabel(job) }}</div>
              </button>
              <span class="badge badge--run">{{ t(locale, 'building') }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section__head">{{ t(locale, 'sectionFailing') }}</div>
        <div v-if="!data.failing.length" class="empty empty--soft">—</div>
        <div v-else class="cards cards--grid">
          <div v-for="job in data.failing" :key="job.fullName" class="card card--row">
            <PinButton
              :active="isPinned(job.fullName)"
              size="sm"
              :title="isPinned(job.fullName) ? t(locale, 'unpin') : t(locale, 'pin')"
              @click="emit('togglePin', job.fullName)"
            />
            <span class="dot" :class="'dot--' + tone(job)" />
            <button type="button" class="card__hit" @click="emit('openJob', job.fullName)">
              <div class="card__title">{{ job.fullName }}</div>
              <div class="card__meta">{{ jobLabel(job) }} · {{ formatRelative(job.lastBuildTimestamp, locale) }}</div>
            </button>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section__head">
          {{ t(locale, 'sectionQueue') }}
          <button type="button" class="btn btn--sm btn--ghost" @click="emit('goQueue')">{{ t(locale, 'queue') }} →</button>
        </div>
        <div v-if="!data.queue.length" class="empty empty--soft">{{ t(locale, 'emptyQueue') }}</div>
        <div v-else class="cards cards--dense">
          <div v-for="q in data.queue" :key="q.id" class="card card--row">
            <button
              v-if="q.taskName"
              type="button"
              class="card__hit"
              @click="emit('openJob', q.taskName!)"
            >
              <div class="card__title">{{ q.taskName }}</div>
              <div class="card__meta">{{ q.why || '—' }} · {{ formatRelative(q.inQueueSince, locale) }}</div>
            </button>
            <span v-else class="card__hit" style="cursor:default">
              <div class="card__title">#{{ q.id }}</div>
              <div class="card__meta">{{ q.why || '—' }} · {{ formatRelative(q.inQueueSince, locale) }}</div>
            </span>
            <span v-if="q.blocked" class="badge badge--warn">{{ t(locale, 'blocked') }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ov-pulse {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  animation: ov-pulse 1s ease-in-out infinite;
  flex: 0 0 auto;
}
@keyframes ov-pulse {
  0%, 100% { opacity: .35; transform: scale(.9); }
  50% { opacity: 1; transform: scale(1); }
}
</style>
