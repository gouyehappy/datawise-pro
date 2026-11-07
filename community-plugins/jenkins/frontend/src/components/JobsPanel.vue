<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { getPlugin, invoke, openExternalUrl, storageGet, storageSet } from '../lib/bridge'
import {
  formatBytes,
  formatDuration,
  formatElapsed,
  formatRelative,
  formatTime,
  paramKind,
  statusFromJob,
} from '../lib/format'
import { loadJobParams, saveJobParams } from '../lib/jobParams'
import { statusLabel, t, type Locale } from '../lib/i18n'
import { countLogMatches, extractFailSummary, highlightLogHtml } from '../lib/logAssist'
import type { ArtifactInfo, BuildSummary, JobParameter, JobSummary, ViewInfo } from '../lib/types'
import HScrollRail from './HScrollRail.vue'
import PinButton from './PinButton.vue'
import SplitPane from './SplitPane.vue'
import ViewPicker from './ViewPicker.vue'

type TriggerPhase = 'triggering' | 'queued'

const props = withDefaults(
  defineProps<{
    locale: Locale
    readOnly: boolean
    pins: string[]
    focusJob?: string
    active?: boolean
  }>(),
  { active: true },
)

const LOG_MAX_CHARS = 450_000

const emit = defineEmits<{
  toast: [message: string, kind?: 'ok' | 'error']
  togglePin: [fullName: string]
}>()

const activeTab = ref('__all__')
const jobFilter = ref('')
const views = ref<ViewInfo[]>([])
const jobs = ref<JobSummary[]>([])
const loading = ref(false)
const refreshing = ref(false)
const selectedFullName = ref('')
const selectedSnapshot = ref<JobSummary | null>(null)
const detailLoading = ref(false)
const detailReady = ref(false)
const description = ref('')
const jobUrl = ref('')
const builds = ref<BuildSummary[]>([])
const parameters = ref<JobParameter[]>([])
const selectedBuild = ref<BuildSummary | null>(null)
const lastSuccess = ref<BuildSummary | null>(null)
const lastFailure = ref<BuildSummary | null>(null)
/** DOM is the source of truth for log body; keep only a length flag to avoid dual buffers. */
const logLen = ref(0)
const logNext = ref(0)
const logMore = ref(false)
const logError = ref('')
const logLive = ref(false)
const logFetching = ref(false)
const follow = ref(true)
const logFullscreen = ref(false)
const artifacts = ref<ArtifactInfo[]>([])
/** relativePath → local saved path (for reveal). */
const localArtifactPaths = ref<Record<string, string>>({})
const failSummary = ref('')
const hintExpanded = ref(false)
const logQuery = ref('')
const logMatchIndex = ref(0)
const paramsOpen = ref(false)
const stopOpen = ref(false)
const paramValues = ref<Record<string, string>>({})
const pendingTriggerJob = ref('')
const triggerPhase = reactive<Record<string, TriggerPhase>>({})
const searchRef = ref<HTMLInputElement | null>(null)
const logRef = ref<HTMLPreElement | null>(null)
const logFsRef = ref<HTMLPreElement | null>(null)
const buildsRailRef = ref<{ update?: () => void; scrollChildIntoView?: (sel: string) => void } | null>(null)
const favsRailRef = ref<{ update?: () => void } | null>(null)
/** Mirror of console text — paintLog may run before <pre> mounts (detailReady gate). */
let logMirror = ''
const favNames = ref<string[]>([])
const viewPickerRef = ref<{ toggleFavorite?: (name: string, e?: Event) => Promise<void> } | null>(null)

const logMatchCount = computed(() => countLogMatches(logMirror, logQuery.value))
const buildHint = computed(() => {
  const r = String(selectedBuild.value?.result || '').toUpperCase()
  if (!failSummary.value) return null
  if (r === 'FAILURE') return { tone: 'bad' as const, label: t(props.locale, 'failSummary') }
  if (r === 'UNSTABLE') return { tone: 'warn' as const, label: t(props.locale, 'unstableSummary') }
  if (r === 'ABORTED') return { tone: 'muted' as const, label: t(props.locale, 'abortSummary') }
  return null
})
const hintOneLine = computed(() => {
  const line = (failSummary.value || '').split(/\n/).map((s) => s.trim()).find(Boolean) || ''
  return line.length > 120 ? `${line.slice(0, 117)}…` : line
})

const favChips = computed(() => {
  const byName = new Map(views.value.map((v) => [v.name, v]))
  return favNames.value.map((n) => byName.get(n)).filter(Boolean) as ViewInfo[]
})

function onFavorites(names: string[]) {
  favNames.value = names
  refreshRails()
}

async function unpinFavChip(name: string, e?: Event) {
  e?.stopPropagation()
  await viewPickerRef.value?.toggleFavorite?.(name)
}

let logTimer: number | null = null
let pollTimer: number | null = null
let logInflight = false
let logGen = 0
let logWatchJob = ''
let logWatchBuild = 0
let ignoreScroll = false
let detailReq = 0

type DescribeSnap = {
  jobName: string
  at: number
  job: Record<string, unknown>
  parameters: JobParameter[]
}
const DESCRIBE_TTL_MS = 10_000
let describeCache: DescribeSnap | null = null

async function fetchDescribe(jobName: string, opts?: { force?: boolean }): Promise<DescribeSnap> {
  if (
    !opts?.force
    && describeCache
    && describeCache.jobName === jobName
    && Date.now() - describeCache.at < DESCRIBE_TTL_MS
  ) {
    return describeCache
  }
  const res = await invoke<{
    job?: Record<string, unknown>
    parameters?: JobParameter[]
  }>('jenkins/jobs/describe', { jobName })
  describeCache = {
    jobName,
    at: Date.now(),
    job: (res.job || {}) as Record<string, unknown>,
    parameters: Array.isArray(res.parameters) ? res.parameters : [],
  }
  return describeCache
}

function invalidateDescribe(jobName?: string) {
  if (!jobName || describeCache?.jobName === jobName) describeCache = null
}

const tableJobs = computed(() => {
  let rows = jobs.value.filter((j) => !j.folder)
  if (activeTab.value === '__pins__') {
    const set = new Set(props.pins)
    const byName = new Map(rows.filter((j) => set.has(j.fullName)).map((j) => [j.fullName, j]))
    rows = props.pins.map((p) => byName.get(p)).filter(Boolean) as JobSummary[]
  } else if (props.pins.length) {
    // Pinned jobs first (stable pin order), then the rest in list order.
    const pinSet = new Set(props.pins)
    const byName = new Map(rows.map((j) => [j.fullName, j]))
    const pinned = props.pins.map((p) => byName.get(p)).filter(Boolean) as JobSummary[]
    const rest = rows.filter((j) => !pinSet.has(j.fullName))
    rows = pinned.concat(rest)
  }
  const q = jobFilter.value.trim().toLowerCase()
  if (q) rows = rows.filter((j) => (j.fullName || j.name || '').toLowerCase().includes(q))
  return rows
})

const ROW_H = 32
const VIRT_THRESHOLD = 80
const VIRT_OVERSCAN = 10
const tableWrapRef = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const viewportH = ref(480)
let tableRo: ResizeObserver | null = null

const virtualRows = computed(() => {
  const all = tableJobs.value
  const total = all.length
  if (total < VIRT_THRESHOLD) {
    return {
      enabled: false,
      padTop: 0,
      padBottom: 0,
      rows: all,
    }
  }
  const start = Math.max(0, Math.floor(scrollTop.value / ROW_H) - VIRT_OVERSCAN)
  const visible = Math.ceil(viewportH.value / ROW_H) + VIRT_OVERSCAN * 2
  const end = Math.min(total, start + visible)
  return {
    enabled: true,
    padTop: start * ROW_H,
    padBottom: Math.max(0, (total - end) * ROW_H),
    rows: all.slice(start, end),
  }
})

function onTableScroll(e: Event) {
  scrollTop.value = (e.target as HTMLElement).scrollTop
}

function resetTableScroll() {
  scrollTop.value = 0
  if (tableWrapRef.value) tableWrapRef.value.scrollTop = 0
}

watch(activeTab, () => resetTableScroll())
watch(jobFilter, () => resetTableScroll())

const selectedJob = computed(() => {
  if (!selectedFullName.value) return null
  return jobs.value.find((j) => j.fullName === selectedFullName.value)
    || selectedSnapshot.value
    || null
})

const detailOpen = computed(() => !!selectedFullName.value)

function toneOf(job: JobSummary) {
  if (triggerPhase[job.fullName] === 'triggering' || triggerPhase[job.fullName] === 'queued') return 'run'
  if (isBuilding(job)) return 'run'
  return statusFromJob(job.color, job.lastBuildResult, job.lastBuildBuilding).tone
}

function labelOf(job: JobSummary) {
  const phase = triggerPhase[job.fullName]
  if (phase === 'triggering') return t(props.locale, 'triggering')
  if (phase === 'queued') return t(props.locale, 'queued')
  if (isBuilding(job)) return t(props.locale, 'building')
  return statusLabel(props.locale, statusFromJob(job.color, job.lastBuildResult, job.lastBuildBuilding).key)
}

/** Header badge follows the selected build so it doesn't lie when browsing history. */
function selectedTone() {
  const job = selectedJob.value
  if (!job) return 'muted'
  const phase = triggerPhase[job.fullName]
  if (phase === 'triggering' || phase === 'queued') return 'run'
  const b = selectedBuild.value
  if (b) return statusFromJob(null, b.result, b.building).tone
  return toneOf(job)
}

function selectedLabel() {
  const job = selectedJob.value
  if (!job) return ''
  const phase = triggerPhase[job.fullName]
  if (phase === 'triggering') return t(props.locale, 'triggering')
  if (phase === 'queued') return t(props.locale, 'queued')
  const b = selectedBuild.value
  if (b) return statusLabel(props.locale, statusFromJob(null, b.result, b.building).key)
  return labelOf(job)
}

function chipResultLabel(b: BuildSummary) {
  if (b.building) return t(props.locale, 'building')
  return statusLabel(props.locale, statusFromJob(null, b.result, false).key)
}

function formatLogStamp(ms?: number | null) {
  if (!ms || ms <= 0) return ''
  try {
    return new Date(ms).toLocaleString(props.locale === 'zh-CN' ? 'zh-CN' : undefined, {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return formatTime(ms)
  }
}

function scrollActiveChipIntoView() {
  nextTick(() => {
    buildsRailRef.value?.scrollChildIntoView?.('.chip.is-active')
    buildsRailRef.value?.update?.()
  })
}

function shortName(job: JobSummary) {
  const full = job.fullName || job.name || ''
  const parts = full.split('/')
  return parts[parts.length - 1] || full
}

function isPinned(name: string) {
  return props.pins.includes(name)
}

function isBuilding(job: JobSummary) {
  return !!(job.lastBuildBuilding || (job.color || '').endsWith('_anime'))
}

function isTriggering(name: string) {
  return triggerPhase[name] === 'triggering'
}

function isQueued(name: string) {
  return triggerPhase[name] === 'queued'
}

function isActionBusy(name: string) {
  return isTriggering(name) || isQueued(name)
}

function setPhase(name: string, phase: TriggerPhase | null) {
  if (!phase) delete triggerPhase[name]
  else triggerPhase[name] = phase
}

function patchJob(fullName: string, patch: Partial<JobSummary>) {
  const idx = jobs.value.findIndex((j) => j.fullName === fullName)
  if (idx >= 0) {
    jobs.value[idx] = { ...jobs.value[idx], ...patch }
  }
  if (selectedSnapshot.value?.fullName === fullName) {
    selectedSnapshot.value = { ...selectedSnapshot.value, ...patch }
  }
}

function rememberSelection(job: JobSummary) {
  selectedSnapshot.value = { ...job }
}

async function loadViews() {
  try {
    const res = await invoke<{ views: ViewInfo[] }>('jenkins/views/list', {})
    views.value = Array.isArray(res.views) ? res.views : []
  } catch {
    views.value = []
  }
}

async function fetchJobs(): Promise<JobSummary[]> {
  if (activeTab.value === '__pins__' || activeTab.value === '__all__') {
    const res = await invoke<{ jobs: JobSummary[] }>('jenkins/jobs/list', { browse: false })
    return Array.isArray(res?.jobs) ? res.jobs : []
  }
  const res = await invoke<{ jobs: JobSummary[] }>('jenkins/jobs/list', {
    view: activeTab.value,
    browse: false,
  })
  return Array.isArray(res?.jobs) ? res.jobs : []
}

function applyJobs(next: JobSummary[], soft: boolean) {
  if (!soft || !jobs.value.length) {
    jobs.value = next
    return
  }
  const prev = jobs.value
  const sameOrder =
    prev.length === next.length && prev.every((j, i) => j.fullName === next[i]?.fullName)
  if (!sameOrder) {
    jobs.value = next
    return
  }
  for (let i = 0; i < next.length; i++) {
    const a = prev[i]
    const b = next[i]
    if (
      a.color !== b.color
      || a.lastBuildBuilding !== b.lastBuildBuilding
      || a.lastBuildNumber !== b.lastBuildNumber
      || a.lastBuildResult !== b.lastBuildResult
      || a.lastBuildDuration !== b.lastBuildDuration
      || a.lastBuildTimestamp !== b.lastBuildTimestamp
      || a.lastSuccessTimestamp !== b.lastSuccessTimestamp
      || a.lastFailureTimestamp !== b.lastFailureTimestamp
      || a.buildable !== b.buildable
    ) {
      Object.assign(a, b)
    }
  }
}

async function refresh(opts?: { soft?: boolean; syncDetail?: boolean }) {
  const soft = !!opts?.soft
  if (!soft) loading.value = true
  else refreshing.value = true
  try {
    const next = await fetchJobs()
    applyJobs(next, soft)
    if (selectedFullName.value) {
      const found = next.find((j) => j.fullName === selectedFullName.value)
      if (found) rememberSelection(found)
    }
    for (const name of Object.keys(triggerPhase)) {
      const row = next.find((j) => j.fullName === name)
      if (row && isBuilding(row)) setPhase(name, null)
    }
    if (
      opts?.syncDetail
      && selectedFullName.value
      && detailReady.value
    ) {
      await loadDetail(selectedFullName.value, selectedBuild.value?.number, { soft: true })
    }
  } catch (e) {
    if (!soft) emit('toast', e instanceof Error ? e.message : String(e), 'error')
  } finally {
    if (!soft) loading.value = false
    refreshing.value = false
  }
}

async function onTabChange(tab: string) {
  activeTab.value = tab
  await storageSet('jenkins.viewTab', tab)
  await refresh()
  await nextTick()
  searchRef.value?.focus()
}

function clearDetailContent() {
  stopLogWatch()
  stopPoll()
  detailReq += 1
  description.value = ''
  jobUrl.value = ''
  builds.value = []
  parameters.value = []
  selectedBuild.value = null
  lastSuccess.value = null
  lastFailure.value = null
  logGen += 1
  logLen.value = 0
  logNext.value = 0
  logMore.value = false
  logError.value = ''
  logLive.value = false
  logFetching.value = false
  logFullscreen.value = false
  artifacts.value = []
  localArtifactPaths.value = {}
  failSummary.value = ''
  hintExpanded.value = false
  logQuery.value = ''
  logMatchIndex.value = 0
  detailReady.value = false
  detailLoading.value = false
  paintLog('', true)
}

function closeDetail() {
  selectedFullName.value = ''
  selectedSnapshot.value = null
  clearDetailContent()
}

/** Instant header from list row; wipe body so previous job never lingers. */
function prepareSwitch(job: JobSummary) {
  stopLogWatch()
  const req = ++detailReq
  rememberSelection(job)
  selectedFullName.value = job.fullName
  description.value = ''
  jobUrl.value = ''
  builds.value = []
  parameters.value = []
  artifacts.value = []
  localArtifactPaths.value = {}
  failSummary.value = ''
  hintExpanded.value = false
  logQuery.value = ''
  logMatchIndex.value = 0
  selectedBuild.value = job.lastBuildNumber
    ? {
        number: job.lastBuildNumber,
        building: !!job.lastBuildBuilding,
        result: job.lastBuildResult ?? null,
        timestamp: job.lastBuildTimestamp,
        duration: job.lastBuildDuration,
      }
    : null
  lastSuccess.value = job.lastSuccessNumber
    ? { number: job.lastSuccessNumber, timestamp: job.lastSuccessTimestamp }
    : null
  lastFailure.value = job.lastFailureNumber
    ? { number: job.lastFailureNumber, timestamp: job.lastFailureTimestamp }
    : null
  logGen += 1
  logLen.value = 0
  logNext.value = 0
  logMore.value = false
  logError.value = ''
  logLive.value = false
  logFetching.value = true
  detailReady.value = false
  detailLoading.value = true
  follow.value = true
  void nextTick(() => paintLog('', true))
  return req
}

async function openJob(fullName: string, opts?: { force?: boolean; preferPins?: boolean }) {
  let tabChanged = false
  if (opts?.preferPins && props.pins.includes(fullName) && activeTab.value !== '__pins__') {
    activeTab.value = '__pins__'
    await storageSet('jenkins.viewTab', '__pins__')
    tabChanged = true
  }
  // Ensure the target row exists in the current list (switch to All if needed).
  let known = jobs.value.find((j) => j.fullName === fullName)
  if (!known || tabChanged) {
    await refresh({ soft: true })
    known = jobs.value.find((j) => j.fullName === fullName)
  }
  if (
    known
    && !tableJobs.value.some((j) => j.fullName === fullName)
    && activeTab.value !== '__all__'
    && activeTab.value !== '__pins__'
  ) {
    activeTab.value = '__all__'
    await storageSet('jenkins.viewTab', '__all__')
    await refresh({ soft: true })
    known = jobs.value.find((j) => j.fullName === fullName)
  }

  if (known) {
    const emptyLog = !logMirror || logMirror === t(props.locale, 'logEmpty') || logLen.value <= 0
    if (selectedFullName.value === fullName && detailReady.value && !opts?.force && !emptyLog) {
      await loadDetail(fullName, undefined, { soft: true })
      await nextTick()
      ensureJobVisible(fullName)
      return
    }
    const req = prepareSwitch(known)
    await nextTick()
    ensureJobVisible(fullName)
    await loadDetail(fullName, undefined, { req })
    return
  }
  selectedFullName.value = fullName
  rememberSelection({ name: fullName, fullName })
  const req = ++detailReq
  detailReady.value = false
  detailLoading.value = true
  await loadDetail(fullName, undefined, { req })
}

function ensureJobVisible(fullName: string) {
  const idx = tableJobs.value.findIndex((j) => j.fullName === fullName)
  if (idx < 0 || !tableWrapRef.value) return
  if (tableJobs.value.length >= VIRT_THRESHOLD) {
    const top = idx * ROW_H
    const bottom = top + ROW_H
    const viewTop = tableWrapRef.value.scrollTop
    const viewBottom = viewTop + tableWrapRef.value.clientHeight
    if (top < viewTop) tableWrapRef.value.scrollTop = top
    else if (bottom > viewBottom) tableWrapRef.value.scrollTop = bottom - tableWrapRef.value.clientHeight
    scrollTop.value = tableWrapRef.value.scrollTop
  }
  nextTick(() => {
    document.querySelector<HTMLElement>(`.jobs-table tr.is-active`)
      ?.scrollIntoView({ block: 'nearest' })
  })
}

async function onRowClick(job: JobSummary) {
  const emptyLog = !logMirror || logMirror === t(props.locale, 'logEmpty') || logLen.value <= 0
  if (selectedFullName.value === job.fullName && detailReady.value && !emptyLog) return
  const req = prepareSwitch(job)
  await nextTick()
  ensureJobVisible(job.fullName)
  await loadDetail(job.fullName, undefined, { req })
}

async function loadDetail(
  jobName: string,
  preferBuild?: number,
  opts?: { soft?: boolean; req?: number; useCache?: boolean },
) {
  const soft = !!opts?.soft && detailReady.value && selectedFullName.value === jobName
  const req = opts?.req ?? detailReq
  if (!soft) detailLoading.value = true
  const prevNum = selectedBuild.value?.number
  const keepWatch =
    soft
    && logLive.value
    && logWatchJob === jobName
    && !!preferBuild
    && preferBuild === logWatchBuild
  if (!keepWatch && !soft) stopLogWatch()
  try {
    // useCache: one-shot reuse after quickBuild parameter probe; soft refreshes always re-fetch.
    const snap = await fetchDescribe(jobName, { force: !opts?.useCache })
    if (opts?.useCache) invalidateDescribe(jobName)
    if (req !== detailReq) return

    const job = snap.job || {}
    description.value = String(job.description || '')
    jobUrl.value = String(job.url || '')
    parameters.value = snap.parameters
    const rawBuilds = Array.isArray(job.builds) ? (job.builds as BuildSummary[]) : []
    builds.value = rawBuilds
    lastSuccess.value = (job.lastSuccessfulBuild as BuildSummary) || null
    lastFailure.value = (job.lastFailedBuild as BuildSummary) || null

    const pick =
      (preferBuild ? rawBuilds.find((b) => b.number === preferBuild) : null)
      || (follow.value || !soft ? rawBuilds[0] : rawBuilds.find((b) => b.number === prevNum))
      || rawBuilds[0]
      || (job.lastBuild as BuildSummary | undefined)
      || null
    selectedBuild.value = pick || null

    const buildingFlag = !!(pick?.building || String(job.color || '').endsWith('_anime'))
    patchJob(jobName, {
      color: String(job.color || '') || undefined,
      lastBuildBuilding: buildingFlag,
      lastBuildNumber: pick?.number,
      lastBuildResult: pick?.result ?? null,
      lastBuildTimestamp: pick?.timestamp,
      lastBuildDuration: pick?.duration,
    })
    if (buildingFlag) setPhase(jobName, null)

    if (pick?.number) {
      const sameBuild = soft && prevNum === pick.number && (logLen.value > 0 || logLive.value) && !logError.value
      const tasks: Promise<void>[] = []
      if (!sameBuild) tasks.push(loadLog(jobName, pick.number, true))
      else if (pick.building) tasks.push(loadLog(jobName, pick.number, false))
      // Artifacts are usually archived at the end — always refresh once the build is done.
      // Only skip while soft-polling the same still-running build.
      if (!soft || !sameBuild || !pick.building) tasks.push(loadArtifacts(jobName, pick.number))
      await Promise.all(tasks)
      if (req !== detailReq) return
      if (pick.building) {
        if (!keepWatch || logWatchBuild !== pick.number) startLogWatch(jobName, pick.number)
      } else if (!soft) {
        stopLogWatch()
      }
    } else if (!soft) {
      logLen.value = 0
      logError.value = ''
      artifacts.value = []
      paintLog('', true)
    }
    if (req !== detailReq) return
    detailReady.value = true
    await nextTick()
    if (req !== detailReq) return
    // loadLog often finishes while the skeleton still owns the pane — flush mirror into <pre>.
    flushLogToDom()
    refreshFailSummary()
    refreshRails()
    scrollActiveChipIntoView()
    if (follow.value) scrollLogToEnd(true)
  } catch (e) {
    if (req !== detailReq) return
    if (!soft) emit('toast', e instanceof Error ? e.message : String(e), 'error')
  } finally {
    if (req === detailReq) detailLoading.value = false
  }
}

function friendlyLogError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  if (/HTML error page|<!DOCTYPE|<html/i.test(raw)) {
    return `${t(props.locale, 'logFailed')} (404)`
  }
  const short = raw.replace(/\s+/g, ' ').trim()
  return short.length > 160 ? `${short.slice(0, 157)}…` : short
}

function logEls(): HTMLPreElement[] {
  return [logRef.value, logFsRef.value].filter(Boolean) as HTMLPreElement[]
}

function syncLogLen(display: string, hadText: boolean) {
  const emptyLabel = t(props.locale, 'logEmpty')
  logLen.value = display === emptyLabel && !hadText ? 0 : display.length
}

function applyLogDom() {
  const els = logEls()
  if (!els.length) return
  const q = logQuery.value.trim()
  const useHtml = !!q && !logError.value && logMirror !== t(props.locale, 'logEmpty')
  for (const el of els) {
    if (useHtml) el.innerHTML = highlightLogHtml(logMirror, q)
    else el.textContent = logMirror
  }
  if (useHtml) highlightActiveMatch()
}

function paintLog(text: string, replace: boolean) {
  const emptyLabel = t(props.locale, 'logEmpty')
  const display = text || (replace ? emptyLabel : '')
  if (replace) logMirror = display
  else if (text) logMirror += text
  const els = logEls()
  if (!els.length) {
    // <pre> not mounted yet (skeleton) — keep mirror; flushLogToDom after detailReady.
    if (replace) syncLogLen(display, !!text)
    else if (text) logLen.value = logMirror === emptyLabel ? 0 : logMirror.length
    return
  }
  applyLogDom()
  if (replace) syncLogLen(display, !!text)
  else if (text) logLen.value = logMirror === emptyLabel ? 0 : logMirror.length
}

/** Push buffered console text into DOM after the log <pre> mounts. */
function flushLogToDom() {
  applyLogDom()
}

function refreshFailSummary() {
  const r = String(selectedBuild.value?.result || '').toUpperCase()
  if (r !== 'FAILURE' && r !== 'UNSTABLE' && r !== 'ABORTED') {
    failSummary.value = ''
    hintExpanded.value = false
    return
  }
  const text = readLogText()
  const next = extractFailSummary(text)
  if (next !== failSummary.value) hintExpanded.value = false
  failSummary.value = next
}

function highlightActiveMatch() {
  const marks = logRef.value?.querySelectorAll('mark.log-hit')
  if (!marks?.length) return
  marks.forEach((m) => m.classList.remove('is-active'))
  const idx = ((logMatchIndex.value % marks.length) + marks.length) % marks.length
  logMatchIndex.value = idx
  const el = marks[idx] as HTMLElement
  el.classList.add('is-active')
  el.scrollIntoView({ block: 'center', inline: 'nearest' })
}

function jumpLogMatch(delta: number) {
  const n = logMatchCount.value
  if (!n) return
  logMatchIndex.value = (logMatchIndex.value + delta + n) % n
  applyLogDom()
}

function setLogQuery(q: string) {
  logQuery.value = q
  logMatchIndex.value = 0
  applyLogDom()
  if (q.trim() && logMatchCount.value) highlightActiveMatch()
}

function onLogQueryInput() {
  logMatchIndex.value = 0
  applyLogDom()
  if (logQuery.value.trim() && logMatchCount.value) {
    nextTick(() => highlightActiveMatch())
  }
}

function refreshRails() {
  nextTick(() => {
    buildsRailRef.value?.update?.()
    favsRailRef.value?.update?.()
  })
}

function readLogText(): string {
  const emptyLabel = t(props.locale, 'logEmpty')
  const primary = logRef.value?.textContent || logFsRef.value?.textContent || logMirror
  if (logError.value && (!primary || primary === emptyLabel)) return logError.value
  if (primary === emptyLabel) return ''
  return primary
}

function trimLogIfNeeded() {
  const current = readLogText()
  if (current.length <= LOG_MAX_CHARS) {
    logLen.value = current.length
    return
  }
  const keep = Math.floor(LOG_MAX_CHARS * 0.75)
  const trimmed = '…\n' + current.slice(-keep)
  paintLog(trimmed, true)
  scrollLogToEnd(true)
}

function nearBottom(el: HTMLElement, px = 56) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= px
}

function shouldStickFollow() {
  if (!follow.value) return false
  const els = logEls()
  if (!els.length) return true
  return els.some((el) => nearBottom(el))
}

function scrollLogToEnd(force = false) {
  if (!force && !shouldStickFollow()) return
  ignoreScroll = true
  requestAnimationFrame(() => {
    for (const el of logEls()) {
      el.scrollTop = el.scrollHeight
    }
    requestAnimationFrame(() => { ignoreScroll = false })
  })
}

function onLogScroll(e: Event) {
  if (ignoreScroll || !logLive.value) return
  const el = e.target as HTMLElement
  if (!el) return
  // User scrolled away from bottom → pause stickiness without fighting them
  if (!nearBottom(el, 72)) {
    if (follow.value) follow.value = false
  } else if (!follow.value) {
    follow.value = true
  }
}

async function loadLog(jobName: string, buildNumber: number, reset: boolean) {
  if (logInflight && !reset) return
  if (reset) {
    logGen += 1
    logNext.value = 0
    logError.value = ''
    logFetching.value = true
  }
  const gen = logGen
  logInflight = true
  try {
    const res = await invoke<{ text: string; more: boolean; next: number }>('jenkins/builds/log', {
      jobName,
      buildNumber,
      start: reset ? 0 : logNext.value,
    })
    if (gen !== logGen) return
    logError.value = ''
    const chunk = res.text || ''
    await nextTick()
    if (gen !== logGen) return
    if (reset) {
      paintLog(chunk, true)
      trimLogIfNeeded()
      scrollLogToEnd(true)
      refreshFailSummary()
    } else if (chunk) {
      const stick = shouldStickFollow()
      paintLog(chunk, false)
      trimLogIfNeeded()
      if (stick || follow.value) scrollLogToEnd(true)
      if (!logMore.value) refreshFailSummary()
    }
    logNext.value = res.next ?? logNext.value
    logMore.value = !!res.more
    if (!logMore.value) refreshFailSummary()
  } catch (e) {
    if (gen !== logGen) return
    if (reset || logLen.value <= 0) {
      logError.value = friendlyLogError(e)
      logLen.value = 0
      failSummary.value = ''
      await nextTick()
      paintLog(logError.value, true)
    }
    stopLogWatch()
  } finally {
    if (gen === logGen) {
      logInflight = false
      logFetching.value = false
    }
  }
}

async function loadArtifacts(jobName: string, buildNumber: number) {
  try {
    const res = await invoke<{ artifacts: ArtifactInfo[] }>('jenkins/builds/artifacts', {
      jobName,
      buildNumber,
    })
    artifacts.value = Array.isArray(res.artifacts) ? res.artifacts : []
    localArtifactPaths.value = {}
  } catch {
    artifacts.value = []
    localArtifactPaths.value = {}
  }
}

let pausedWatchJob = ''
let pausedWatchBuild = 0

function startLogWatch(jobName: string, buildNumber: number) {
  stopLogWatch()
  logWatchJob = jobName
  logWatchBuild = buildNumber
  logLive.value = true
  if (!props.active) {
    pausedWatchJob = jobName
    pausedWatchBuild = buildNumber
    return
  }
  const tick = async () => {
    if (!logLive.value || logWatchJob !== jobName || logWatchBuild !== buildNumber) return
    if (!props.active || document.visibilityState === 'hidden') {
      logTimer = window.setTimeout(tick, 1500)
      return
    }
    try {
      await loadLog(jobName, buildNumber, false)
      if (!logMore.value) {
        stopLogWatch()
        // Soft detail patches the list row via patchJob — skip a second list RPC.
        // Force artifact reload: archive usually lands after the console closes.
        await loadArtifacts(jobName, buildNumber)
        await loadDetail(jobName, buildNumber, { soft: true })
        return
      }
    } catch {
      stopLogWatch()
      return
    }
    const delay = logMore.value ? 700 : 1100
    logTimer = window.setTimeout(tick, delay)
  }
  logTimer = window.setTimeout(tick, 500)
}

function stopLogWatch() {
  if (logTimer != null) {
    clearTimeout(logTimer)
    logTimer = null
  }
  logLive.value = false
  logWatchJob = ''
  logWatchBuild = 0
  pausedWatchJob = ''
  pausedWatchBuild = 0
}

function stopPoll() {
  if (pollTimer != null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function toggleLogFullscreen() {
  const text = logError.value || readLogText()
  logFullscreen.value = !logFullscreen.value
  void nextTick(() => {
    paintLog(text, true)
    if (follow.value) scrollLogToEnd(true)
  })
}

function onLogKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && logFullscreen.value) {
    e.preventDefault()
    logFullscreen.value = false
  }
}

async function chooseBuild(build: BuildSummary) {
  if (!selectedFullName.value) return
  if (selectedBuild.value?.number === build.number) return
  follow.value = false
  selectedBuild.value = build
  failSummary.value = ''
  hintExpanded.value = false
  logQuery.value = ''
  logMatchIndex.value = 0
  localArtifactPaths.value = {}
  stopLogWatch()
  // Hard clear console before fetch so previous build never lingers.
  paintLog('', true)
  await loadLog(selectedFullName.value, build.number, true)
  await loadArtifacts(selectedFullName.value, build.number)
  refreshFailSummary()
  scrollActiveChipIntoView()
  if (build.building) {
    follow.value = true
    startLogWatch(selectedFullName.value, build.number)
  } else {
    follow.value = false
  }
}

async function quickBuild(job: JobSummary, e?: Event) {
  e?.stopPropagation()
  if (props.readOnly || job.folder || job.buildable === false) return
  if (isActionBusy(job.fullName) || isBuilding(job)) return
  pendingTriggerJob.value = job.fullName
  rememberSelection(job)
  try {
    const snap = await fetchDescribe(job.fullName, { force: true })
    parameters.value = snap.parameters
    if (parameters.value.length) {
      const remembered = await loadJobParams(job.fullName)
      const values: Record<string, string> = {}
      for (const p of parameters.value) {
        const kind = paramKind(p.type)
        if (remembered[p.name] != null && remembered[p.name] !== '' && kind !== 'password') {
          values[p.name] = remembered[p.name]
        } else if (kind === 'boolean') {
          values[p.name] = p.defaultValue === 'true' ? 'true' : 'false'
        } else {
          values[p.name] = p.defaultValue ?? (p.choices?.[0] ?? '')
        }
      }
      paramValues.value = values
      paramsOpen.value = true
      return
    }
    // Reuse the just-fetched describe for the post-trigger detail soft load.
    await doTrigger(job.fullName, {}, { useCache: true })
  } catch (err) {
    emit('toast', err instanceof Error ? err.message : String(err), 'error')
  }
}

function openTrigger() {
  if (props.readOnly || !selectedJob.value) return
  void quickBuild(selectedJob.value)
}

function startAfterTriggerPoll(jobName: string, baselineBuild?: number) {
  stopPoll()
  let ticks = 0
  pollTimer = window.setInterval(async () => {
    if (!props.active || document.visibilityState === 'hidden') return
    ticks += 1
    try {
      // List-only until the build appears — avoid describe/artifacts every tick.
      await refresh({ soft: true })
      const row = jobs.value.find((j) => j.fullName === jobName)
      const newest = row?.lastBuildNumber
      if (row && isBuilding(row)) {
        setPhase(jobName, null)
        stopPoll()
        if (selectedFullName.value === jobName) {
          await loadDetail(jobName, undefined, { soft: true })
          if (selectedBuild.value?.building) {
            startLogWatch(jobName, selectedBuild.value.number)
          }
        }
        return
      }
      if (newest && baselineBuild && newest > baselineBuild) {
        setPhase(jobName, null)
        stopPoll()
        if (selectedFullName.value === jobName) {
          await loadDetail(jobName, newest, { soft: true })
        }
        return
      }
      if (ticks >= 12) {
        setPhase(jobName, null)
        stopPoll()
      }
    } catch {
      if (ticks >= 8) {
        setPhase(jobName, null)
        stopPoll()
      }
    }
  }, 1400)
}

async function doTrigger(
  jobName: string,
  paramsMap: Record<string, string>,
  opts?: { useCache?: boolean },
) {
  if (!jobName || props.readOnly) return
  if (isActionBusy(jobName)) return
  paramsOpen.value = false
  setPhase(jobName, 'triggering')
  const baseline = jobs.value.find((j) => j.fullName === jobName)?.lastBuildNumber
    || selectedBuild.value?.number
  // Keep current selection if already open; otherwise open detail smoothly without wiping list
  if (selectedFullName.value !== jobName) {
    selectedFullName.value = jobName
  }
  {
    const cur = jobs.value.find((j) => j.fullName === jobName)?.color || 'blue'
    const base = String(cur).replace(/_anime$/i, '') || 'blue'
    patchJob(jobName, { lastBuildBuilding: true, color: `${base}_anime` })
  }
  try {
    await invoke('jenkins/jobs/trigger', { jobName, parameters: paramsMap })
    const passwordKeys = new Set(
      parameters.value.filter((p) => paramKind(p.type) === 'password').map((p) => p.name),
    )
    if (Object.keys(paramsMap).length) {
      void saveJobParams(jobName, paramsMap, passwordKeys)
    }
    setPhase(jobName, 'queued')
    emit('toast', t(props.locale, 'triggerOk'))
    follow.value = true
    await loadDetail(jobName, undefined, {
      soft: detailReady.value,
      useCache: !!opts?.useCache,
    })
    // Later poll soft-refreshes must see new builds.
    invalidateDescribe(jobName)
    startAfterTriggerPoll(jobName, baseline)
  } catch (e) {
    setPhase(jobName, null)
    patchJob(jobName, { lastBuildBuilding: false })
    emit('toast', e instanceof Error ? e.message : String(e), 'error')
  } finally {
    pendingTriggerJob.value = ''
  }
}

async function confirmStop() {
  if (!selectedFullName.value || !selectedBuild.value || props.readOnly) return
  const jobName = selectedFullName.value
  setPhase(jobName, 'triggering')
  stopOpen.value = false
  try {
    await invoke('jenkins/builds/stop', {
      jobName,
      buildNumber: selectedBuild.value.number,
    })
    emit('toast', t(props.locale, 'stopOk'))
    await loadDetail(jobName, selectedBuild.value.number, { soft: true })
    await refresh({ soft: true })
  } catch (e) {
    emit('toast', e instanceof Error ? e.message : String(e), 'error')
  } finally {
    setPhase(jobName, null)
  }
}

async function downloadArtifact(artifact: ArtifactInfo) {
  if (!selectedFullName.value || !selectedBuild.value || props.readOnly) return
  try {
    const res = await invoke<{ path: string; sizeBytes?: number }>('jenkins/builds/download', {
      jobName: selectedFullName.value,
      buildNumber: selectedBuild.value.number,
      relativePath: artifact.relativePath,
    })
    localArtifactPaths.value = {
      ...localArtifactPaths.value,
      [artifact.relativePath]: res.path,
    }
    if (res.sizeBytes != null) {
      artifacts.value = artifacts.value.map((a) =>
        a.relativePath === artifact.relativePath ? { ...a, sizeBytes: res.sizeBytes } : a,
      )
    }
    emit('toast', t(props.locale, 'downloaded', { path: res.path }))
  } catch (e) {
    emit('toast', e instanceof Error ? e.message : String(e), 'error')
  }
}

async function revealArtifact(artifact: ArtifactInfo) {
  const path = localArtifactPaths.value[artifact.relativePath]
  if (!path) {
    await downloadArtifact(artifact)
  }
  const local = localArtifactPaths.value[artifact.relativePath]
  if (!local) return
  try {
    await invoke('jenkins/fs/reveal', { path: local })
    emit('toast', t(props.locale, 'revealOk'))
  } catch (e) {
    emit('toast', e instanceof Error ? e.message : String(e), 'error')
  }
}

async function copyLog() {
  try {
    const text = readLogText()
    const plugin = getPlugin()
    if (plugin.clipboard?.writeText) await plugin.clipboard.writeText(text)
    else await navigator.clipboard.writeText(text)
    emit('toast', t(props.locale, 'copied'))
  } catch (e) {
    emit('toast', e instanceof Error ? e.message : String(e), 'error')
  }
}

async function openExternal(url?: string) {
  if (!url) return
  const ok = await openExternalUrl(url)
  if (!ok) emit('toast', t(props.locale, 'openFailed'), 'error')
}

function buildBtnTitle(job: JobSummary) {
  if (isTriggering(job.fullName)) return t(props.locale, 'triggering')
  if (isQueued(job.fullName)) return t(props.locale, 'queued')
  if (isBuilding(job)) return t(props.locale, 'building')
  return t(props.locale, 'quickBuild')
}

function lastBuildLabel(job: JobSummary) {
  if (isActionBusy(job.fullName) || isBuilding(job)) return t(props.locale, 'building')
  if (job.lastBuildNumber) return `#${job.lastBuildNumber}`
  return '—'
}

function lastBuildTime(job: JobSummary) {
  return formatRelative(job.lastBuildTimestamp || job.lastSuccessTimestamp || job.lastFailureTimestamp, props.locale)
}

function lastBuildTitle(job: JobSummary) {
  const ts = job.lastBuildTimestamp || job.lastSuccessTimestamp || job.lastFailureTimestamp
  return ts ? formatTime(ts) : ''
}

/** Keeps running-build elapsed labels ticking without extra RPCs. */
const nowTick = ref(Date.now())
let elapsedTimer: number | null = null
const hasRunningJobs = computed(() => jobs.value.some((j) => isBuilding(j)))
function syncElapsedTimer() {
  const need = props.active && (!!selectedBuild.value?.building || hasRunningJobs.value)
  if (need) {
    if (elapsedTimer == null) {
      elapsedTimer = window.setInterval(() => { nowTick.value = Date.now() }, 1000)
    }
  } else if (elapsedTimer != null) {
    clearInterval(elapsedTimer)
    elapsedTimer = null
  }
}
watch([() => props.active, () => selectedBuild.value?.building, hasRunningJobs], syncElapsedTimer)

function jobDurationLabel(job: JobSummary) {
  void nowTick.value
  if (isBuilding(job) && job.lastBuildTimestamp) return formatElapsed(job.lastBuildTimestamp)
  return formatDuration(job.lastBuildDuration)
}

function selectedDurationLabel() {
  void nowTick.value
  const b = selectedBuild.value
  if (!b) return '—'
  if (b.building && b.timestamp) return formatElapsed(b.timestamp)
  return formatDuration(b.duration)
}

function chipDuration(b: BuildSummary) {
  void nowTick.value
  if (b.building && b.timestamp) return formatElapsed(b.timestamp)
  return formatDuration(b.duration)
}

function chipTone(b: BuildSummary) {
  if (b.building) return 'chip--run'
  const r = String(b.result || '').toUpperCase()
  if (r === 'SUCCESS') return 'chip--ok'
  if (r === 'FAILURE') return 'chip--bad'
  if (r === 'UNSTABLE') return 'chip--warn'
  if (r === 'ABORTED' || r === 'NOT_BUILT') return 'chip--muted'
  return ''
}

function buildChipTitle(b: BuildSummary) {
  const bits = [
    chipResultLabel(b),
    chipDuration(b),
    b.timestamp ? formatRelative(b.timestamp, props.locale) : '',
  ].filter(Boolean)
  return bits.join(' · ')
}

const successFailMeta = computed(() => {
  const ok = lastSuccess.value?.number ? `#${lastSuccess.value.number}` : '—'
  const bad = lastFailure.value?.number ? `#${lastFailure.value.number}` : '—'
  const okAge = lastSuccess.value?.timestamp
    ? formatRelative(lastSuccess.value.timestamp, props.locale)
    : ''
  const badAge = lastFailure.value?.timestamp
    ? formatRelative(lastFailure.value.timestamp, props.locale)
    : ''
  return {
    text: `${ok}${okAge ? ` ${okAge}` : ''} / ${bad}${badAge ? ` ${badAge}` : ''}`,
    title: [
      lastSuccess.value?.timestamp ? `${t(props.locale, 'lastSuccess')} ${formatTime(lastSuccess.value.timestamp)}` : '',
      lastFailure.value?.timestamp ? `${t(props.locale, 'lastFailure')} ${formatTime(lastFailure.value.timestamp)}` : '',
    ].filter(Boolean).join('\n'),
  }
})

const visibleBuilds = computed(() => builds.value.slice(0, 24))
const hiddenBuildCount = computed(() => Math.max(0, builds.value.length - visibleBuilds.value.length))

function triggerBtnLabel() {
  const name = selectedFullName.value
  if (!name) return t(props.locale, 'trigger')
  if (isTriggering(name)) return t(props.locale, 'triggering')
  if (isQueued(name)) return t(props.locale, 'queued')
  if (selectedJob.value && isBuilding(selectedJob.value)) return t(props.locale, 'building')
  return t(props.locale, 'trigger')
}

watch(() => props.focusJob, async (name) => { if (name) await openJob(name) })

watch(
  () => props.active,
  (on) => {
    if (on) {
      if (pausedWatchJob && pausedWatchBuild && selectedBuild.value?.building) {
        startLogWatch(pausedWatchJob, pausedWatchBuild)
      }
    } else if (logLive.value && logWatchJob) {
      pausedWatchJob = logWatchJob
      pausedWatchBuild = logWatchBuild
      if (logTimer != null) {
        clearTimeout(logTimer)
        logTimer = null
      }
    }
  },
)

onMounted(async () => {
  document.addEventListener('keydown', onLogKey)
  await nextTick()
  if (tableWrapRef.value && typeof ResizeObserver !== 'undefined') {
    tableRo = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height
      if (h && Math.abs(h - viewportH.value) > 2) viewportH.value = h
    })
    tableRo.observe(tableWrapRef.value)
    viewportH.value = tableWrapRef.value.clientHeight || 480
  }
  await loadViews()
  const saved = await storageGet('jenkins.viewTab')
  if (saved === '__all__' || saved === '__pins__' || views.value.some((v) => v.name === saved)) {
    activeTab.value = saved
  }
  if (props.active) {
    await refresh()
    await nextTick()
    searchRef.value?.focus()
  }
  if (props.focusJob) await openJob(props.focusJob)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onLogKey)
  stopLogWatch()
  stopPoll()
  tableRo?.disconnect()
  tableRo = null
  if (elapsedTimer != null) {
    clearInterval(elapsedTimer)
    elapsedTimer = null
  }
})
defineExpose({ refresh, openJob })
</script>

<template>
  <div class="jobs-root">
  <div class="jobs-workspace" :class="{ 'has-detail': detailOpen }">
    <SplitPane
      class="jobs-split"
      :class="{ 'jk-split--solo': !detailOpen }"
      storage-key="jenkins.split.jobs"
      :default-width="520"
      :min-width="360"
      :max-width="760"
    >
      <template #start>
        <div class="jobs-pane">
          <div class="jobs-toolbar">
            <div class="jobs-toolbar__row">
              <ViewPicker
                ref="viewPickerRef"
                :locale="locale"
                :views="views"
                :model-value="activeTab"
                :pin-count="pins.length"
                @update:model-value="onTabChange"
                @favorites="onFavorites"
              />
              <input
                ref="searchRef"
                v-model="jobFilter"
                class="input jobs-search"
                type="search"
                :placeholder="t(locale, 'searchJobs')"
              />
              <span
                class="jobs-count"
                :title="t(locale, 'rows', { count: tableJobs.length })"
              >{{ tableJobs.length }}</span>
              <span v-if="refreshing || loading" class="jobs-pulse" :title="t(locale, 'refresh')" aria-hidden="true" />
            </div>
            <div v-if="favChips.length" class="jobs-favs">
              <HScrollRail
                ref="favsRailRef"
                :aria-left="t(locale, 'scrollLeft')"
                :aria-right="t(locale, 'scrollRight')"
              >
                <div class="jobs-favs__row">
                  <button
                    v-for="v in favChips"
                    :key="v.name"
                    type="button"
                    class="jobs-fav"
                    :class="{ 'is-on': activeTab === v.name }"
                    :title="v.description || v.name"
                    @click="onTabChange(v.name)"
                  >
                    <span class="jobs-fav__star" aria-hidden="true">★</span>
                    <span class="jobs-fav__name">{{ v.name }}</span>
                    <span
                      class="jobs-fav__x"
                      role="button"
                      tabindex="-1"
                      :title="t(locale, 'unpinView')"
                      @click="unpinFavChip(v.name, $event)"
                    >×</span>
                  </button>
                </div>
              </HScrollRail>
            </div>
          </div>
          <div ref="tableWrapRef" class="jobs-table-wrap thin-scroll" @scroll.passive="onTableScroll">
            <div v-if="loading && !jobs.length" class="empty">{{ t(locale, 'loading') }}</div>
            <div v-else-if="activeTab === '__pins__' && !pins.length" class="jobs-empty">
              <div class="jobs-empty__icon" aria-hidden="true">★</div>
              <div class="empty__title">{{ t(locale, 'emptyPins') }}</div>
              <div class="item__meta">{{ t(locale, 'selectJobHint') }}</div>
            </div>
            <div v-else-if="!tableJobs.length" class="jobs-empty">
              <div class="jobs-empty__icon" aria-hidden="true">☰</div>
              <div class="empty__title">{{ t(locale, 'emptyJobs') }}</div>
              <div class="item__meta">{{ t(locale, 'emptyJobsHint') }}</div>
            </div>
            <table v-else class="jobs-table">
              <thead>
                <tr>
                  <th class="col-pin" />
                  <th class="col-s">{{ t(locale, 'colStatus') }}</th>
                  <th class="col-name">{{ t(locale, 'colName') }}</th>
                  <th class="col-last">{{ t(locale, 'colLastBuild') }}</th>
                  <th class="col-dur">{{ t(locale, 'colDuration') }}</th>
                  <th class="col-act" />
                </tr>
              </thead>
              <tbody>
                <tr v-if="virtualRows.enabled && virtualRows.padTop" class="virt-pad" aria-hidden="true">
                  <td :colspan="6" :style="{ height: virtualRows.padTop + 'px', padding: 0, border: 0 }" />
                </tr>
                <tr
                  v-for="job in virtualRows.rows"
                  :key="job.fullName"
                  :class="{
                    'is-active': job.fullName === selectedFullName,
                    'is-running': isBuilding(job) || isActionBusy(job.fullName),
                  }"
                  @click="onRowClick(job)"
                >
                  <td class="col-pin" @click.stop>
                    <PinButton
                      :active="isPinned(job.fullName)"
                      size="sm"
                      :title="isPinned(job.fullName) ? t(locale, 'unpin') : t(locale, 'pin')"
                      @click="emit('togglePin', job.fullName)"
                    />
                  </td>
                  <td class="col-s">
                    <span
                      class="status-pill status-pill--compact"
                      :class="'status-pill--' + toneOf(job)"
                      :title="labelOf(job)"
                    >
                      <i class="status-ball" :class="'status-ball--' + toneOf(job)" />
                      <span class="status-pill__txt">{{ labelOf(job) }}</span>
                    </span>
                  </td>
                  <td class="col-name">
                    <div class="job-name" :title="job.fullName">{{ shortName(job) }}</div>
                  </td>
                  <td class="col-last">
                    <div class="last-build" :title="lastBuildTitle(job)">
                      <span>{{ lastBuildLabel(job) }}</span>
                      <span class="item__meta">{{ lastBuildTime(job) }}</span>
                    </div>
                  </td>
                  <td class="col-dur" :title="isBuilding(job) ? t(locale, 'elapsed') : t(locale, 'duration')">
                    {{ jobDurationLabel(job) }}
                  </td>
                  <td class="col-act" @click.stop>
                    <button
                      type="button"
                      class="btn-build"
                      :class="{
                        'is-busy': isActionBusy(job.fullName),
                        'is-run': isBuilding(job) && !isActionBusy(job.fullName),
                      }"
                      :disabled="readOnly || job.buildable === false || isActionBusy(job.fullName) || isBuilding(job)"
                      :title="buildBtnTitle(job)"
                      @click="quickBuild(job, $event)"
                    >
                      <span v-if="isActionBusy(job.fullName)" class="btn-build__spin" aria-hidden="true" />
                      <span v-else-if="isBuilding(job)" class="btn-build__pulse" aria-hidden="true">●</span>
                      <span v-else>▶</span>
                    </button>
                  </td>
                </tr>
                <tr v-if="virtualRows.enabled && virtualRows.padBottom" class="virt-pad" aria-hidden="true">
                  <td :colspan="6" :style="{ height: virtualRows.padBottom + 'px', padding: 0, border: 0 }" />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>

      <template #end>
        <section class="detail-pane" :class="{ 'is-empty': !detailOpen }">
          <div v-if="!detailOpen" class="detail detail--empty">
            <div class="jobs-empty">
              <div class="jobs-empty__icon" aria-hidden="true">›</div>
              <div class="empty__title">{{ t(locale, 'selectJob') }}</div>
              <div class="item__meta">{{ t(locale, 'selectJobHint') }}</div>
            </div>
          </div>
          <div v-else-if="selectedJob" class="detail" :class="{ 'is-switching': detailLoading && !detailReady }">
            <div class="detail__head">
              <div class="row">
                <PinButton
                  :active="isPinned(selectedJob.fullName)"
                  :title="isPinned(selectedJob.fullName) ? t(locale, 'unpin') : t(locale, 'pin')"
                  @click="emit('togglePin', selectedJob.fullName)"
                />
                <div class="detail__titles">
                  <div class="detail__title" :title="selectedJob.fullName">{{ shortName(selectedJob) }}</div>
                  <div v-if="shortName(selectedJob) !== selectedJob.fullName" class="item__meta">{{ selectedJob.fullName }}</div>
                </div>
                <span class="badge" :class="'badge--' + selectedTone()">{{ selectedLabel() }}</span>
                <span class="grow" />
                <button
                  type="button"
                  class="btn btn--primary btn--sm"
                  :class="{ 'is-busy': isActionBusy(selectedJob.fullName) || isBuilding(selectedJob) }"
                  :disabled="readOnly || isActionBusy(selectedJob.fullName) || isBuilding(selectedJob)"
                  @click="openTrigger"
                >
                  <span v-if="isActionBusy(selectedJob.fullName)" class="btn-inline-spin" />
                  {{ triggerBtnLabel() }}
                </button>
                <button
                  type="button"
                  class="btn btn--danger btn--sm"
                  :disabled="readOnly || isTriggering(selectedJob.fullName) || !selectedBuild?.building"
                  @click="stopOpen = true"
                >
                  {{ t(locale, 'stop') }}
                </button>
                <button type="button" class="btn btn--sm" :disabled="!jobUrl" @click="openExternal(jobUrl)">{{ t(locale, 'openJob') }}</button>
                <button type="button" class="btn btn--ghost btn--sm" @click="closeDetail">✕</button>
              </div>
              <div v-if="description && detailReady" class="item__meta detail__desc">{{ description }}</div>
              <div class="meta-grid meta-grid--inline">
                <div class="meta">
                  <div class="meta__k">{{ t(locale, 'started') }}</div>
                  <div
                    class="meta__v"
                    :title="selectedBuild?.timestamp ? formatTime(selectedBuild.timestamp) : ''"
                  >
                    {{ formatRelative(selectedBuild?.timestamp, locale) }}
                  </div>
                </div>
                <div class="meta">
                  <div class="meta__k">{{ selectedBuild?.building ? t(locale, 'elapsed') : t(locale, 'duration') }}</div>
                  <div class="meta__v">{{ selectedDurationLabel() }}</div>
                </div>
                <div class="meta">
                  <div class="meta__k">{{ t(locale, 'lastSuccess') }} / {{ t(locale, 'lastFailure') }}</div>
                  <div class="meta__v" :title="successFailMeta.title">{{ successFailMeta.text }}</div>
                </div>
              </div>
            </div>

            <div v-if="!detailReady" class="detail-skel">
              <div class="detail-skel__chips">
                <span v-for="n in 5" :key="n" class="skel skel--chip" />
              </div>
              <div class="block block--log">
                <div class="log-bar">
                  <strong>{{ t(locale, 'buildLog') }}</strong>
                  <span class="item__meta">{{ t(locale, 'loading') }}</span>
                </div>
                <div class="log log--skel">
                  <span class="skel skel--line" />
                  <span class="skel skel--line skel--short" />
                  <span class="skel skel--line" />
                  <span class="skel skel--line skel--mid" />
                  <span class="skel skel--line skel--short" />
                </div>
              </div>
            </div>
            <template v-else>
              <div class="builds-shell">
                <HScrollRail
                  ref="buildsRailRef"
                  :aria-left="t(locale, 'scrollLeft')"
                  :aria-right="t(locale, 'scrollRight')"
                >
                  <div class="builds">
                    <button
                      v-for="b in visibleBuilds"
                      :key="b.number"
                      type="button"
                      class="chip"
                      :class="[chipTone(b), { 'is-active': selectedBuild?.number === b.number }]"
                      :title="buildChipTitle(b)"
                      @click="chooseBuild(b)"
                    >
                      <span class="chip__num">#{{ b.number }}</span>
                      <span class="chip__res">{{ chipResultLabel(b) }}</span>
                      <span class="chip__meta">{{ chipDuration(b) }}</span>
                    </button>
                    <span v-if="hiddenBuildCount" class="builds__more" :title="String(builds.length)">+{{ hiddenBuildCount }}</span>
                  </div>
                </HScrollRail>
              </div>
              <div class="hint-slot" :class="{ 'has-hint': !!buildHint }">
                <div
                  v-if="buildHint"
                  class="hint-bar"
                  :class="['hint-bar--' + buildHint.tone, { 'is-open': hintExpanded }]"
                >
                  <button type="button" class="hint-bar__row" @click="hintExpanded = !hintExpanded">
                    <span class="hint-bar__lab">{{ buildHint.label }}</span>
                    <span class="hint-bar__one">{{ hintOneLine }}</span>
                    <span class="hint-bar__toggle">{{ hintExpanded ? t(locale, 'hintLess') : t(locale, 'hintMore') }}</span>
                  </button>
                  <pre v-if="hintExpanded" class="hint-bar__body">{{ failSummary }}</pre>
                </div>
              </div>
              <div class="block block--log">
                <div class="log-bar">
                  <div class="log-bar__title">
                    <strong>{{ t(locale, 'buildLog') }}{{ selectedBuild ? ` #${selectedBuild.number}` : '' }}</strong>
                    <span v-if="logLive" class="log-live"><i /><span>{{ t(locale, 'logLive') }}</span></span>
                    <span v-else-if="logFetching" class="item__meta">{{ t(locale, 'loading') }}</span>
                    <span v-else-if="selectedBuild" class="item__meta">{{ formatLogStamp(selectedBuild.timestamp) }}</span>
                  </div>
                  <label class="switch"><input v-model="follow" type="checkbox" />{{ t(locale, 'follow') }}</label>
                  <span class="grow" />
                  <button type="button" class="btn btn--sm btn--ghost" @click="copyLog">{{ t(locale, 'copy') }}</button>
                  <button type="button" class="btn btn--sm btn--ghost" @click="toggleLogFullscreen">{{ t(locale, 'logFullscreen') }}</button>
                </div>
                <div class="log-find">
                  <input
                    v-model="logQuery"
                    class="input log-find__input"
                    type="search"
                    :placeholder="t(locale, 'logSearchHint')"
                    :aria-label="t(locale, 'logSearch')"
                    @input="onLogQueryInput"
                    @keydown.enter.prevent="jumpLogMatch($event.shiftKey ? -1 : 1)"
                  />
                  <button
                    type="button"
                    class="btn btn--sm log-find__err"
                    :class="{ 'is-on': logQuery.trim().toUpperCase() === 'ERROR' }"
                    :title="t(locale, 'logJumpError')"
                    @click="setLogQuery(logQuery.trim().toUpperCase() === 'ERROR' ? '' : 'ERROR')"
                  >{{ t(locale, 'logJumpError') }}</button>
                  <span v-if="logQuery.trim()" class="item__meta log-find__count">
                    {{ logMatchCount ? `${(logMatchIndex % Math.max(logMatchCount, 1)) + 1}/${logMatchCount}` : '0' }}
                  </span>
                  <button type="button" class="btn btn--sm btn--ghost log-find__nav" :disabled="!logMatchCount" @click="jumpLogMatch(-1)">{{ t(locale, 'logSearchPrev') }}</button>
                  <button type="button" class="btn btn--sm btn--ghost log-find__nav" :disabled="!logMatchCount" @click="jumpLogMatch(1)">{{ t(locale, 'logSearchNext') }}</button>
                </div>
                <pre
                  ref="logRef"
                  class="log thin-scroll"
                  :class="{ 'log--error': !!logError, 'log--live': logLive, 'log--html': !!logQuery.trim() && !logError }"
                  @scroll="onLogScroll"
                />
              </div>
              <div v-if="artifacts.length" class="block block--artifacts">
                <div class="artifacts__head">
                  <strong>{{ t(locale, 'artifacts') }}</strong>
                  <span class="item__meta">{{ artifacts.length }}</span>
                </div>
                <div v-for="a in artifacts" :key="a.relativePath" class="artifact">
                  <span class="artifact__name" :title="a.relativePath">{{ a.fileName || a.relativePath }}</span>
                  <span v-if="a.sizeBytes != null" class="artifact__size item__meta">{{ formatBytes(a.sizeBytes) }}</span>
                  <button type="button" class="btn btn--sm" :disabled="readOnly" @click="downloadArtifact(a)">{{ t(locale, 'download') }}</button>
                  <button
                    type="button"
                    class="btn btn--sm"
                    :disabled="readOnly"
                    :title="t(locale, 'revealFolder')"
                    @click="revealArtifact(a)"
                  >{{ t(locale, 'revealFolder') }}</button>
                </div>
              </div>
            </template>
          </div>
        </section>
      </template>
    </SplitPane>
  </div>

  <div v-if="paramsOpen" class="modal-mask" @click.self="paramsOpen = false">
    <div class="modal" role="dialog">
      <strong>{{ t(locale, 'parameters') }}</strong>
      <div class="item__meta">{{ pendingTriggerJob }}</div>
      <div v-for="p in parameters" :key="p.name" class="field">
        <label :for="'p-' + p.name">{{ p.name }}</label>
        <select v-if="paramKind(p.type) === 'choice' && p.choices?.length" :id="'p-' + p.name" v-model="paramValues[p.name]" class="input">
          <option v-for="c in p.choices" :key="c" :value="c">{{ c }}</option>
        </select>
        <select v-else-if="paramKind(p.type) === 'boolean'" :id="'p-' + p.name" v-model="paramValues[p.name]" class="input">
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
        <textarea v-else-if="paramKind(p.type) === 'text'" :id="'p-' + p.name" v-model="paramValues[p.name]" class="input" rows="3" />
        <input v-else :id="'p-' + p.name" v-model="paramValues[p.name]" class="input" :type="paramKind(p.type) === 'password' ? 'password' : 'text'" />
      </div>
      <div class="modal__actions">
        <button type="button" class="btn" @click="paramsOpen = false">{{ t(locale, 'cancel') }}</button>
        <button type="button" class="btn btn--primary" @click="doTrigger(pendingTriggerJob || selectedFullName, paramValues)">{{ t(locale, 'run') }}</button>
      </div>
    </div>
  </div>

  <div v-if="stopOpen" class="modal-mask" @click.self="stopOpen = false">
    <div class="modal" role="dialog">
      <strong>{{ t(locale, 'confirmStop') }}</strong>
      <div class="item__meta">{{ t(locale, 'confirmStopHint') }}</div>
      <div class="modal__actions">
        <button type="button" class="btn" @click="stopOpen = false">{{ t(locale, 'cancel') }}</button>
        <button type="button" class="btn btn--danger" @click="confirmStop">{{ t(locale, 'confirm') }}</button>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="logFullscreen" class="log-fs" role="dialog" aria-modal="true">
      <div class="log-fs__bar">
        <strong>{{ t(locale, 'buildLog') }}{{ selectedBuild ? ` #${selectedBuild.number}` : '' }} · {{ selectedJob?.fullName || '' }}</strong>
        <label class="switch"><input v-model="follow" type="checkbox" />{{ t(locale, 'follow') }}</label>
        <span class="grow" />
        <button type="button" class="btn btn--sm" @click="copyLog">{{ t(locale, 'copy') }}</button>
        <button type="button" class="btn btn--sm" @click="toggleLogFullscreen">{{ t(locale, 'logExitFullscreen') }}</button>
      </div>
      <pre
        ref="logFsRef"
        class="log log--fs thin-scroll"
        :class="{ 'log--error': !!logError, 'log--live': logLive }"
        @scroll="onLogScroll"
      />
    </div>
  </Teleport>
  </div>
</template>
