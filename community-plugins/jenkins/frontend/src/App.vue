<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import JobsPanel from './components/JobsPanel.vue'
import NodesPanel from './components/NodesPanel.vue'
import OverviewPanel from './components/OverviewPanel.vue'
import QueuePanel from './components/QueuePanel.vue'
import {
  applyTheme,
  invoke,
  openExternalUrl,
  storageGet,
  storageSet,
  waitReady,
  type PluginContext,
} from './lib/bridge'
import { resolveLocale, t, type Locale } from './lib/i18n'
import { loadPins, savePins, togglePin } from './lib/pins'
import type { NavId, Overview } from './lib/types'

const locale = ref<Locale>('zh-CN')
const nav = ref<NavId>('overview')
const overview = ref<Overview | null>(null)
const pins = ref<string[]>([])
const focusJob = ref('')
const bootError = ref('')
const status = ref('')
const toastMsg = ref('')
const toastKind = ref<'ok' | 'error'>('ok')
/** Live count from Queue panel; falls back to overview.queueCount. */
const queueLiveCount = ref<number | null>(null)
let toastTimer: number | null = null

const overviewRef = ref<InstanceType<typeof OverviewPanel> | null>(null)
const jobsRef = ref<InstanceType<typeof JobsPanel> | null>(null)
const queueRef = ref<InstanceType<typeof QueuePanel> | null>(null)
const nodesRef = ref<InstanceType<typeof NodesPanel> | null>(null)

const endpoint = computed(() => overview.value?.baseUrl || '—')
const readOnly = computed(() => !!overview.value?.readOnly)
const queueCount = computed(() => queueLiveCount.value ?? overview.value?.queueCount ?? 0)

function showToast(message: string, kind: 'ok' | 'error' = 'ok') {
  toastMsg.value = message
  toastKind.value = kind
  if (toastTimer != null) clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { toastMsg.value = '' }, 3200)
}

function applyOverviewMeta(data: Overview | null | undefined) {
  if (!data) return
  overview.value = data
  queueLiveCount.value = data.queueCount ?? 0
  status.value = [
    data.version ? `${t(locale.value, 'version')} ${data.version}` : '',
    data.nodeName || '',
    data.readOnly ? t(locale.value, 'readOnly') : '',
  ].filter(Boolean).join(' · ')
}

function onQueueCount(n: number) {
  queueLiveCount.value = Math.max(0, Number(n) || 0)
}

/** Lightweight header refresh — avoid full overview (jobs+nodes+queue scan). */
async function loadOverviewLite() {
  try {
    const [info, queue] = await Promise.all([
      invoke<Partial<Overview>>('jenkins/info', {}),
      invoke<{ items?: unknown[] }>('jenkins/queue/list', {}),
    ])
    const queueCount = Array.isArray(queue.items) ? queue.items.length : overview.value?.queueCount ?? 0
    const merged = {
      ...(overview.value || {
        queue: [],
        building: [],
        failing: [],
        offlineNodes: 0,
        busyExecutors: 0,
        totalExecutors: 0,
      }),
      ...info,
      queueCount,
    } as Overview
    applyOverviewMeta(merged)
  } catch (e) {
    if (!overview.value) throw e
  }
}

/** Topbar refresh — one request path per page, no duplicate overview. */
async function refreshActive() {
  try {
    if (nav.value === 'overview') {
      const snap = await overviewRef.value?.refresh()
      applyOverviewMeta(snap ?? overviewRef.value?.snapshot?.() ?? null)
      return
    }
    if (nav.value === 'queue') {
      // Queue panel is the source of truth for the rail badge while open.
      await queueRef.value?.refresh()
      return
    }
    // Keep header/queue badge fresh without blocking panel refresh
    void loadOverviewLite().catch(() => undefined)
    if (nav.value === 'jobs') await jobsRef.value?.refresh({ soft: true, syncDetail: true })
    else if (nav.value === 'nodes') await nodesRef.value?.refresh()
  } catch (e) {
    showToast(e instanceof Error ? e.message : String(e), 'error')
  }
}

async function openConsole() {
  if (!overview.value?.baseUrl) return
  const ok = await openExternalUrl(overview.value.baseUrl)
  if (!ok) showToast(t(locale.value, 'openFailed'), 'error')
}

async function setNav(next: NavId) {
  if (nav.value === next) return
  nav.value = next
  focusJob.value = ''
  await storageSet('jenkins.nav', next)
  try {
    if (next === 'overview') {
      const snap = await overviewRef.value?.refresh()
      applyOverviewMeta(snap ?? overviewRef.value?.snapshot?.() ?? null)
    } else if (next === 'queue') {
      await queueRef.value?.refresh()
    } else if (next === 'nodes') {
      await nodesRef.value?.refresh()
    } else if (next === 'jobs') {
      await jobsRef.value?.refresh({ soft: true, syncDetail: true })
    }
  } catch (e) {
    showToast(e instanceof Error ? e.message : String(e), 'error')
  }
}

async function openJob(fullName: string) {
  focusJob.value = fullName
  nav.value = 'jobs'
  await storageSet('jenkins.nav', 'jobs')
  // nextTick so Jobs panel is visible (v-show) before hard-open + scroll.
  await Promise.resolve()
  await jobsRef.value?.openJob(fullName, { force: true, preferPins: true })
}

async function onTogglePin(fullName: string) {
  pins.value = togglePin(pins.value, fullName)
  await savePins(pins.value)
}

function syncLocale(ctx?: PluginContext) {
  const plugin = window.datawisePlugin
  locale.value = resolveLocale(ctx?.locale || plugin?.locale || plugin?.context?.locale || navigator.language)
}

function syncTheme(ctx?: PluginContext) {
  const plugin = window.datawisePlugin
  applyTheme(ctx?.theme?.appearance || plugin?.theme?.appearance || plugin?.context?.theme?.appearance)
}

onMounted(async () => {
  try {
    const plugin = await waitReady()
    syncLocale(plugin.context)
    syncTheme(plugin.context)
    pins.value = await loadPins()
    const saved = await storageGet('jenkins.nav')
    if (saved === 'overview' || saved === 'jobs' || saved === 'queue' || saved === 'nodes') {
      nav.value = saved
    }
    const onCtx = plugin.onContextChange || plugin.onContext
    onCtx?.((ctx) => {
      syncLocale(ctx)
      syncTheme(ctx)
    })
    plugin.onThemeChange?.((theme) => applyTheme(theme.appearance))
    if (nav.value === 'overview') {
      const snap = await overviewRef.value?.refresh()
      applyOverviewMeta(snap ?? null)
    } else {
      await loadOverviewLite()
      if (nav.value === 'jobs') await jobsRef.value?.refresh()
      else if (nav.value === 'queue') await queueRef.value?.refresh()
      else if (nav.value === 'nodes') await nodesRef.value?.refresh()
    }
  } catch (e) {
    bootError.value = e instanceof Error ? e.message : String(e)
  }
})
</script>

<template>
  <div class="shell">
    <aside class="rail" :aria-label="t(locale, 'title')">
      <nav class="rail__nav">
        <button
          type="button"
          class="rail__btn"
          :class="{ 'is-active': nav === 'overview' }"
          :title="t(locale, 'overview')"
          :aria-label="t(locale, 'overview')"
          :aria-current="nav === 'overview' ? 'page' : undefined"
          @click="setNav('overview')"
        >
          <svg class="rail__ico" viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true">
            <rect x="2.75" y="2.75" width="6" height="6" rx="1.25" stroke="currentColor" stroke-width="1.5" />
            <rect x="11.25" y="2.75" width="6" height="6" rx="1.25" stroke="currentColor" stroke-width="1.5" />
            <rect x="2.75" y="11.25" width="6" height="6" rx="1.25" stroke="currentColor" stroke-width="1.5" />
            <rect x="11.25" y="11.25" width="6" height="6" rx="1.25" stroke="currentColor" stroke-width="1.5" />
          </svg>
        </button>
        <button
          type="button"
          class="rail__btn"
          :class="{ 'is-active': nav === 'jobs' }"
          :title="t(locale, 'jobs')"
          :aria-label="t(locale, 'jobs')"
          :aria-current="nav === 'jobs' ? 'page' : undefined"
          @click="setNav('jobs')"
        >
          <svg class="rail__ico" viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true">
            <path d="M3.5 5.25h13M3.5 10h13M3.5 14.75h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          <span
            v-if="pins.length"
            class="rail__count"
            :title="t(locale, 'pins') + ': ' + pins.length"
          >{{ pins.length }}</span>
        </button>
        <button
          type="button"
          class="rail__btn"
          :class="{ 'is-active': nav === 'queue' }"
          :title="t(locale, 'queue')"
          :aria-label="t(locale, 'queue')"
          :aria-current="nav === 'queue' ? 'page' : undefined"
          @click="setNav('queue')"
        >
          <svg class="rail__ico" viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true">
            <path d="M4 5.5h12v2.2H4V5.5Zm0 3.9h12v2.2H4V9.4Zm0 3.9h8.5V15.5H4v-2.2Z" fill="currentColor" opacity=".92" />
          </svg>
          <span
            v-if="queueCount > 0"
            class="rail__count is-hot"
            :title="t(locale, 'queue') + ': ' + queueCount"
          >{{ queueCount }}</span>
        </button>
        <button
          type="button"
          class="rail__btn"
          :class="{ 'is-active': nav === 'nodes' }"
          :title="t(locale, 'nodes')"
          :aria-label="t(locale, 'nodes')"
          :aria-current="nav === 'nodes' ? 'page' : undefined"
          @click="setNav('nodes')"
        >
          <svg class="rail__ico" viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true">
            <rect x="3" y="3.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.5" />
            <rect x="11.5" y="3.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.5" />
            <rect x="3" y="11.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.5" />
            <path d="M14.25 11.5v2.25H12M14.25 16.5v-2.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
      </nav>
      <div class="rail__foot">
        <span
          v-if="readOnly"
          class="rail__ro"
          :title="t(locale, 'readOnly')"
          :aria-label="t(locale, 'readOnly')"
        >RO</span>
        <span
          class="rail__dot"
          :class="{ 'is-on': !!overview?.baseUrl }"
          :title="endpoint"
          :aria-label="endpoint"
        />
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <div class="topbar__meta">{{ status || endpoint }}</div>
        <span class="grow" />
        <button type="button" class="btn" @click="openConsole">{{ t(locale, 'openConsole') }}</button>
        <button type="button" class="btn" :title="t(locale, 'refreshHint')" @click="refreshActive">{{ t(locale, 'refresh') }}</button>
      </header>

      <div v-if="bootError" class="empty">
        <div class="empty__title">{{ t(locale, 'error') }}</div>
        <div>{{ bootError || t(locale, 'noConnection') }}</div>
      </div>

      <main v-else class="content">
        <!--
          Host each page in a single panel-host so v-show always hides the whole page.
          JobsPanel is multi-root (modals/teleport); putting v-show on the component itself
          left sibling roots visible and stacked under other menus.
        -->
        <div class="panel-host" :class="{ 'is-active': nav === 'overview' }" v-show="nav === 'overview'">
          <OverviewPanel
            ref="overviewRef"
            :locale="locale"
            :pins="pins"
            :active="nav === 'overview'"
            @toast="showToast"
            @open-job="openJob"
            @toggle-pin="onTogglePin"
            @go-queue="setNav('queue')"
            @meta="applyOverviewMeta"
          />
        </div>
        <div class="panel-host" :class="{ 'is-active': nav === 'jobs' }" v-show="nav === 'jobs'">
          <JobsPanel
            ref="jobsRef"
            :locale="locale"
            :read-only="readOnly"
            :pins="pins"
            :focus-job="focusJob"
            :active="nav === 'jobs'"
            @toast="showToast"
            @toggle-pin="onTogglePin"
          />
        </div>
        <div class="panel-host" :class="{ 'is-active': nav === 'queue' }" v-show="nav === 'queue'">
          <QueuePanel
            ref="queueRef"
            :locale="locale"
            :active="nav === 'queue'"
            @toast="showToast"
            @open-job="openJob"
            @count="onQueueCount"
          />
        </div>
        <div class="panel-host" :class="{ 'is-active': nav === 'nodes' }" v-show="nav === 'nodes'">
          <NodesPanel
            ref="nodesRef"
            :locale="locale"
            :active="nav === 'nodes'"
            @toast="showToast"
          />
        </div>
      </main>

      <footer class="footer">
        <span v-if="overview?.downloadDir">↓ {{ overview.downloadDir }}</span>
      </footer>
    </div>

    <div v-if="toastMsg" class="toast" :class="{ 'toast--error': toastKind === 'error' }">{{ toastMsg }}</div>
  </div>
</template>
