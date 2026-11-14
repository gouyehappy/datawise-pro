<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton, DwInlineAlert, DwSplitPane, EmptyState, ConfirmDialog, DwLogViewer, IconButton, SearchInput} from '@/core/components'
import {DwIcon} from '@/core/icons'
import {explorerApi} from '@/api'
import type {
  JenkinsBuildSummary,
  JenkinsInfo,
  JenkinsJobDetail,
  JenkinsJobSummary,
  JenkinsViewSummary,
} from '@/features/explorer/services/jenkins-jobs.service'
import {
  formatJenkinsDuration,
  formatJenkinsRelativeTime,
  formatJenkinsTimestamp,
  isJenkinsBuildStoppable,
  jenkinsJobStatusLabel,
  jenkinsStatusI18nKey,
} from '@/features/explorer/services/jenkins-jobs.service'
import JenkinsTriggerParamsDialog from '@/features/workspace/components/jenkins/JenkinsTriggerParamsDialog.vue'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {registerStatelessConnectorUse} from '@/features/explorer/services/register-connection-health.service'
import '@/features/workspace/components/shared/connector-browse-panel.css'

const props = defineProps<{
  connectionId: string
  initialJobName?: string
}>()

const {t} = useI18n()
const layout = useLayoutStore()

const nameFilter = ref('')
const views = ref<JenkinsViewSummary[]>([])
const selectedView = ref('')
const folderPath = ref('')
const jobs = ref<JenkinsJobSummary[]>([])
const selectedJob = ref<JenkinsJobDetail | null>(null)
const selectedBuild = ref<JenkinsBuildSummary | null>(null)
const buildLog = ref('')
const logOffset = ref(0)
const loading = ref(false)
const detailLoading = ref(false)
const logLoading = ref(false)
const mutationLoading = ref(false)
const polling = ref(false)
const error = ref<string | null>(null)
/** In-progress queue/wait text for the footer — not a persistent banner. */
const liveStatus = ref<string | null>(null)
const triggerConfirmOpen = ref(false)
const triggerParamsOpen = ref(false)
const stopConfirmOpen = ref(false)
  /** When true, watch/poll always sticks to the job's newest build and auto-scrolls the log. */
  const followLatest = ref(true)
  const jenkinsInfo = ref<JenkinsInfo | null>(null)
  const logViewerRef = ref<{openFullscreen: () => void; scrollToBottom: () => Promise<void>} | null>(null)

let pollTimer: ReturnType<typeof setTimeout> | null = null

const breadcrumbParts = computed(() => {
  const path = folderPath.value.trim().replace(/\\/g, '/')
  if (!path) return [] as string[]
  return path.split('/').filter(Boolean)
})

const isSearching = computed(() => Boolean(nameFilter.value.trim()))

const folderCount = computed(() => jobs.value.filter((job) => job.folder).length)
const jobOnlyCount = computed(() => jobs.value.length - folderCount.value)

const showFolderBreadcrumb = computed(() => {
  if (isSearching.value) return false
  return Boolean(folderPath.value) || folderCount.value > 0
})

const statusText = computed(() => {
  if (liveStatus.value) return liveStatus.value
  if (loading.value) return t('explorer.jenkinsJobs.loading')
  if (polling.value) return t('explorer.jenkinsJobs.polling')
  if (isSearching.value) {
    return t('explorer.jenkinsJobs.searchStatus', {count: jobs.value.length})
  }
  if (folderCount.value > 0) {
    return t('explorer.jenkinsJobs.browseStatus', {
      folders: folderCount.value,
      jobs: jobOnlyCount.value,
    })
  }
  return t('explorer.jenkinsJobs.status', {count: jobOnlyCount.value})
})

function toastNotice(
    message: string | null | undefined,
    variant: 'info' | 'success' | 'warning' | 'error' = 'success',
    durationMs = 3600,
) {
  const text = message?.trim()
  if (!text) return
  layout.showToast(text, {variant, durationMs})
}

function toastBuildFinished(number: number, result: string | null | undefined) {
  const resolved = (result || 'UNKNOWN').trim() || 'UNKNOWN'
  const message = t('explorer.jenkinsJobs.buildFinished', {
    number,
    result: localizeJenkinsStatus(resolved),
  })
  const upper = resolved.toUpperCase()
  if (upper === 'SUCCESS') {
    toastNotice(message, 'success', 4200)
    return
  }
  if (upper === 'UNSTABLE') {
    toastNotice(message, 'warning', 5000)
    return
  }
  if (upper === 'FAILURE' || upper === 'FAILED' || upper === 'ABORTED') {
    toastNotice(message, 'error', 6000)
    return
  }
  toastNotice(message, 'info', 4200)
}

const infoText = computed(() => {
  const info = jenkinsInfo.value
  if (!info) return ''
  const parts = [
    info.version ? `Jenkins ${info.version}` : null,
    info.mode || null,
    info.numExecutors > 0 ? t('explorer.jenkinsJobs.executors', {count: info.numExecutors}) : null,
  ].filter(Boolean)
  return parts.join(' · ')
})

const canStopSelected = computed(() => isJenkinsBuildStoppable(selectedBuild.value))

const hasTriggerParameters = computed(() =>
    (selectedJob.value?.parameterDefinitions?.length ?? 0) > 0,
)

const logTitle = computed(() => {
  const number = selectedBuild.value?.number
  return number != null
      ? t('explorer.jenkinsJobs.buildLog', {number})
      : t('explorer.jenkinsJobs.buildLogTitle')
})

const logSubtitle = computed(() => {
  const jobName = selectedJob.value?.fullName || selectedJob.value?.name
  if (!jobName) return undefined
  return jobName
})

const jobStatusLabel = computed(() => {
  const color = selectedJob.value?.color
  if ((color ?? '').toLowerCase().endsWith('_anime') || selectedBuild.value?.building) {
    return t('explorer.jenkinsJobs.statusBuilding')
  }
  return localizeJenkinsStatus(jenkinsJobStatusLabel(color))
})

function localizeJenkinsStatus(raw: string | null | undefined): string {
  const key = jenkinsStatusI18nKey(raw)
  if (key) return t(key)
  const value = (raw ?? '').trim()
  return value || '—'
}

function jobListStatusLabel(color: string | null | undefined): string {
  if ((color ?? '').toLowerCase().endsWith('_anime')) {
    return t('explorer.jenkinsJobs.statusBuilding')
  }
  return localizeJenkinsStatus(jenkinsJobStatusLabel(color))
}

function jobListResult(job: JenkinsJobSummary): string {
  if (job.lastBuildBuilding || (job.color ?? '').toLowerCase().endsWith('_anime')) {
    return t('explorer.jenkinsJobs.statusBuilding')
  }
  return localizeJenkinsStatus(job.lastBuildResult || jenkinsJobStatusLabel(job.color))
}

function jobRowKey(job: JenkinsJobSummary): string {
  return job.fullName || job.name || `job-${job.url || 'unknown'}`
}

function onLogCopied(ok: boolean) {
  toastNotice(
      ok ? t('common.logViewer.copied') : t('common.logViewer.copyFailed'),
      ok ? 'success' : 'error',
  )
}

function clearPollTimer() {
  if (pollTimer != null) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

function schedulePoll(fn: () => void, delayMs: number) {
  clearPollTimer()
  pollTimer = setTimeout(fn, delayMs)
}

function currentJobName(): string | null {
  const name = selectedJob.value?.fullName || selectedJob.value?.name
  return name?.trim() || null
}

function syncJobListRow(detail: JenkinsJobDetail) {
  const key = detail.fullName || detail.name
  if (!key) return
  const index = jobs.value.findIndex((job) => (job.fullName || job.name) === key)
  if (index < 0) return
  const current = jobs.value[index]
  jobs.value[index] = {
    ...current,
    color: detail.color ?? current.color,
    buildable: detail.buildable,
    url: detail.url ?? current.url,
    folder: current.folder ?? false,
    lastBuildNumber: detail.lastBuild?.number ?? current.lastBuildNumber,
    lastBuildResult: detail.lastBuild?.result ?? current.lastBuildResult,
    lastBuildBuilding: detail.lastBuild?.building ?? current.lastBuildBuilding,
    lastBuildTimestamp: detail.lastBuild?.timestamp ?? current.lastBuildTimestamp,
    lastBuildDuration: detail.lastBuild?.duration ?? current.lastBuildDuration,
    lastSuccessTimestamp: detail.lastSuccessfulBuild?.timestamp ?? current.lastSuccessTimestamp,
    lastFailureTimestamp: detail.lastFailedBuild?.timestamp ?? current.lastFailureTimestamp,
  }
}

/** Jenkins view names that mean "all jobs" (English + common zh install default). */
const JENKINS_ALL_VIEW_ALIASES = new Set(['all', '所有'])

function pickDefaultView(items: JenkinsViewSummary[]): string {
  if (!items.length) return ''
  const preferred = items.find((view) => {
    const name = (view.name ?? '').trim()
    return JENKINS_ALL_VIEW_ALIASES.has(name.toLowerCase()) || JENKINS_ALL_VIEW_ALIASES.has(name)
  })
  return preferred?.name?.trim() || items[0]?.name?.trim() || ''
}

async function loadViews() {
  if (!props.connectionId) return
  try {
    const result = await explorerApi.fetchJenkinsViews(props.connectionId)
    views.value = result.views ?? []
    if (!selectedView.value || !views.value.some((view) => view.name === selectedView.value)) {
      selectedView.value = pickDefaultView(views.value)
    }
  } catch {
    views.value = []
    if (!selectedView.value) selectedView.value = ''
  }
}

async function loadInfo() {
  if (!props.connectionId) return
  try {
    jenkinsInfo.value = await explorerApi.fetchJenkinsInfo(props.connectionId)
  } catch {
    jenkinsInfo.value = null
  }
}

async function loadJobs(options?: {preserveSelection?: boolean}) {
  if (!props.connectionId) return
  const preserve = options?.preserveSelection === true
  const keepJobName = preserve ? currentJobName() : null
  const keepBuildNumber = preserve ? selectedBuild.value?.number : null
  clearPollTimer()
  polling.value = false
  loading.value = true
  error.value = null
  liveStatus.value = null
  if (!preserve) {
    selectedJob.value = null
    selectedBuild.value = null
    buildLog.value = ''
    logOffset.value = 0
  }
  try {
    if (!views.value.length) {
      await loadViews()
    }
    void loadInfo()
    const searching = Boolean(nameFilter.value.trim())
    const result = await explorerApi.fetchJenkinsJobs(props.connectionId, {
      name: nameFilter.value.trim() || undefined,
      limit: 500,
      view: selectedView.value || undefined,
      folder: searching ? undefined : (folderPath.value || undefined),
      browse: !searching,
    })
    jobs.value = result.jobs
    if (keepJobName) {
      const match = jobs.value.find((job) => !job.folder && (job.fullName || job.name) === keepJobName)
      if (match) {
        const detail = await loadJobDetail(keepJobName, {
          preferBuildNumber: keepBuildNumber ?? undefined,
          quiet: true,
        })
        const build = selectedBuild.value
            ?? (detail ? pickBuildFromDetail(detail, keepBuildNumber ?? undefined) : null)
        if (build?.number) {
          selectedBuild.value = build
          await loadBuildLog(keepJobName, build.number, {reset: true, quiet: true})
          if (build.building) {
            startBuildWatch(keepJobName, build.number)
          }
        }
      } else {
        selectedJob.value = null
        selectedBuild.value = null
        buildLog.value = ''
        logOffset.value = 0
      }
    } else {
      const needReload = await selectInitialJobIfNeeded()
      if (needReload && !searching) {
        const nested = await explorerApi.fetchJenkinsJobs(props.connectionId, {
          limit: 500,
          view: selectedView.value || undefined,
          folder: folderPath.value || undefined,
          browse: true,
        })
        jobs.value = nested.jobs
        await selectInitialJobIfNeeded()
      }
    }
    registerStatelessConnectorUse(props.connectionId, 'jenkins', 'ok')
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.jenkinsJobs.loadFailed')
    registerStatelessConnectorUse(props.connectionId, 'jenkins', 'error')
    jobs.value = []
  } finally {
    loading.value = false
  }
}

async function selectView(viewName: string) {
  if (selectedView.value === viewName) return
  selectedView.value = viewName
  folderPath.value = ''
  await loadJobs()
}

async function openFolder(job: JenkinsJobSummary) {
  const path = (job.fullName || job.name || '').trim()
  if (!path) return
  folderPath.value = path
  selectedJob.value = null
  selectedBuild.value = null
  buildLog.value = ''
  await loadJobs()
}

function navigateBreadcrumb(index: number) {
  if (index < 0) {
    folderPath.value = ''
  } else {
    folderPath.value = breadcrumbParts.value.slice(0, index + 1).join('/')
  }
  void loadJobs()
}

function onJobRowClick(job: JenkinsJobSummary) {
  if (job.folder) {
    void openFolder(job)
    return
  }
  void selectJob(job)
}

function pickBuildFromDetail(
    detail: JenkinsJobDetail,
    preferBuildNumber?: number,
): JenkinsBuildSummary | null {
  const preferred = preferBuildNumber != null
      ? detail.builds?.find((build) => build.number === preferBuildNumber)
      : null
  return preferred
      ?? (detail.lastBuild?.building ? detail.lastBuild : null)
      ?? detail.lastBuild
      ?? detail.builds?.[0]
      ?? null
}

async function loadJobDetail(
    jobName: string,
    options?: {preferBuildNumber?: number; quiet?: boolean},
): Promise<JenkinsJobDetail | null> {
  if (!props.connectionId || !jobName) return null
  if (!options?.quiet) detailLoading.value = true
  try {
    const detail = await explorerApi.fetchJenkinsJobDetail(props.connectionId, jobName)
    selectedJob.value = detail
    syncJobListRow(detail)
    selectedBuild.value = pickBuildFromDetail(detail, options?.preferBuildNumber)
    return detail
  } catch (err) {
    if (!options?.quiet) {
      error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.jenkinsJobs.detailFailed')
    }
    return null
  } finally {
    if (!options?.quiet) detailLoading.value = false
  }
}

async function selectJob(job: JenkinsJobSummary) {
  const jobName = job.fullName || job.name
  if (!props.connectionId || !jobName) return
  clearPollTimer()
  polling.value = false
  followLatest.value = true
  error.value = null
  liveStatus.value = null
  selectedBuild.value = null
  buildLog.value = ''
  logOffset.value = 0
  const detail = await loadJobDetail(jobName)
  if (!detail) return
  const build = pickBuildFromDetail(detail)
  if (!build?.number) return
  await loadBuildLog(jobName, build.number, {reset: true})
  if (build.building) {
    startBuildWatch(jobName, build.number)
  }
}

async function loadBuildLog(
    jobName: string,
    buildNumber: number,
    options?: {reset?: boolean; quiet?: boolean},
) {
  if (options?.reset) {
    buildLog.value = ''
    logOffset.value = 0
  }
  if (!options?.quiet) logLoading.value = true
  try {
    const result = await explorerApi.fetchJenkinsBuildLog(
        props.connectionId,
        jobName,
        buildNumber,
        {start: logOffset.value},
    )
    const chunk = result.text ?? ''
    const hadChunk = Boolean(chunk)
    if (options?.reset || logOffset.value <= 0) {
      buildLog.value = chunk
    } else if (chunk) {
      buildLog.value = `${buildLog.value}${chunk}`
    }
    logOffset.value = result.nextStart ?? (logOffset.value + chunk.length)
    if (followLatest.value && (options?.reset || hadChunk)) {
      await logViewerRef.value?.scrollToBottom()
    }
  } catch (err) {
    if (!options?.quiet) {
      buildLog.value = resolveCaughtApiErrorMessage(err, t, 'explorer.jenkinsJobs.logFailed')
    }
  } finally {
    if (!options?.quiet) logLoading.value = false
  }
}

async function selectBuild(build: JenkinsBuildSummary) {
  clearPollTimer()
  polling.value = false
  selectedBuild.value = build
  const jobName = currentJobName()
  if (!jobName || !build.number) return
  const latestNumber = selectedJob.value?.lastBuild?.number
      ?? selectedJob.value?.builds?.[0]?.number
  followLatest.value = build.number === latestNumber
  await loadBuildLog(jobName, build.number, {reset: true})
  if (build.building) {
    startBuildWatch(jobName, build.number)
  }
}

function startBuildWatch(jobName: string, initialBuildNumber: number) {
  clearPollTimer()
  polling.value = true
  let watching = initialBuildNumber
  const tick = async () => {
    if (!props.connectionId || currentJobName() !== jobName) {
      polling.value = false
      return
    }
    const detail = await loadJobDetail(jobName, {
      preferBuildNumber: followLatest.value ? undefined : watching,
      quiet: true,
    })
    const latest = detail?.lastBuild ?? detail?.builds?.[0] ?? null
    let build: JenkinsBuildSummary | null = null
    if (followLatest.value && latest?.number) {
      if (latest.number !== watching) {
        watching = latest.number
        selectedBuild.value = latest
        await loadBuildLog(jobName, watching, {reset: true, quiet: true})
      } else {
        selectedBuild.value = latest
        await loadBuildLog(jobName, watching, {quiet: true})
      }
      build = latest
    } else {
      build = detail?.builds?.find((item) => item.number === watching)
          ?? (detail?.lastBuild?.number === watching ? detail.lastBuild : null)
      if (build) {
        selectedBuild.value = build
        await loadBuildLog(jobName, watching, {quiet: true})
      }
    }
    if (build) {
      if (build.building || (followLatest.value && latest?.building)) {
        schedulePoll(() => { void tick() }, 1000)
        return
      }
      liveStatus.value = null
      toastBuildFinished(build.number ?? watching, build.result)
    }
    polling.value = false
  }
  schedulePoll(() => { void tick() }, 800)
}

async function waitForQueuedBuild(jobName: string, previousBuildNumber: number): Promise<number | null> {
  polling.value = true
  liveStatus.value = t('explorer.jenkinsJobs.waitingForBuild')
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    if (!props.connectionId || currentJobName() !== jobName) {
      polling.value = false
      liveStatus.value = null
      return null
    }
    try {
      const queue = await explorerApi.fetchJenkinsQueue(props.connectionId, {name: jobName})
      const item = queue.items?.[0]
      if (item?.why) {
        liveStatus.value = t('explorer.jenkinsJobs.queueWaiting', {why: item.why})
      }
    } catch {
      // ignore queue probe failures; keep waiting on job detail
    }
    const detail = await loadJobDetail(jobName, {quiet: true})
    if (!detail) continue
    if (detail.inQueue) {
      liveStatus.value = t('explorer.jenkinsJobs.jobInQueue')
    }
    const newest = detail.lastBuild ?? detail.builds?.[0] ?? null
    if (!newest?.number) continue
    if (newest.number > previousBuildNumber || newest.building) {
      selectedBuild.value = newest
      await loadBuildLog(jobName, newest.number, {reset: true})
      liveStatus.value = null
      polling.value = false
      return newest.number
    }
  }
  polling.value = false
  liveStatus.value = null
  toastNotice(t('explorer.jenkinsJobs.waitBuildTimeout'), 'warning', 6000)
  return null
}

async function requestTriggerSelected() {
  if (!selectedJob.value?.buildable) return
  if (hasTriggerParameters.value) {
    triggerParamsOpen.value = true
    return
  }
  triggerConfirmOpen.value = true
}

async function triggerSelected(parameters?: Record<string, string>) {
  const jobName = selectedJob.value?.fullName || selectedJob.value?.name
  if (!props.connectionId || !jobName) return
  triggerConfirmOpen.value = false
  triggerParamsOpen.value = false
  mutationLoading.value = true
  error.value = null
  liveStatus.value = null
  clearPollTimer()
  followLatest.value = true
  const previousBuildNumber = selectedJob.value?.lastBuild?.number
      ?? selectedJob.value?.builds?.[0]?.number
      ?? 0
  try {
    await explorerApi.triggerJenkinsBuild(
        props.connectionId,
        jobName,
        parameters && Object.keys(parameters).length ? {parameters} : undefined,
    )
    toastNotice(t('explorer.jenkinsJobs.triggerQueued'), 'success')
    await loadJobDetail(jobName, {quiet: true})
    const startedNumber = await waitForQueuedBuild(jobName, previousBuildNumber)
    if (startedNumber != null) {
      followLatest.value = true
      startBuildWatch(jobName, startedNumber)
    }
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.jenkinsJobs.triggerFailed')
    polling.value = false
    liveStatus.value = null
  } finally {
    mutationLoading.value = false
  }
}

async function requestStopSelected() {
  if (!canStopSelected.value) return
  stopConfirmOpen.value = true
}

async function stopSelected() {
  const jobName = selectedJob.value?.fullName || selectedJob.value?.name
  const buildNumber = selectedBuild.value?.number
  if (!props.connectionId || !jobName || !buildNumber) return
  stopConfirmOpen.value = false
  mutationLoading.value = true
  error.value = null
  liveStatus.value = null
  try {
    await explorerApi.stopJenkinsBuild(props.connectionId, jobName, buildNumber)
    toastNotice(t('explorer.jenkinsJobs.stopSuccess'), 'info')
    await loadJobDetail(jobName, {preferBuildNumber: buildNumber})
    await loadBuildLog(jobName, buildNumber, {reset: true})
    if (selectedBuild.value?.building) {
      startBuildWatch(jobName, buildNumber)
    } else {
      clearPollTimer()
      polling.value = false
    }
  } catch (err) {
    error.value = resolveCaughtApiErrorMessage(err, t, 'explorer.jenkinsJobs.stopFailed')
  } finally {
    mutationLoading.value = false
  }
}

async function selectInitialJobIfNeeded(): Promise<boolean> {
  const jobName = props.initialJobName?.trim()
  if (!jobName || isSearching.value) return false
  const slash = jobName.lastIndexOf('/')
  const parent = slash > 0 ? jobName.slice(0, slash) : ''
  if (parent && folderPath.value !== parent) {
    folderPath.value = parent
    return true
  }
  const match = jobs.value.find((job) => !job.folder && (job.fullName || job.name) === jobName)
  if (match) {
    await selectJob(match)
  }
  return false
}

function refresh() {
  const jobName = currentJobName()
  if (jobName) {
    void (async () => {
      followLatest.value = true
      // Soft list refresh keeps the current job/build selection when switching tabs back.
      await loadJobs({preserveSelection: true})
    })()
    return
  }
  void loadJobs()
}

defineExpose({refresh})

onMounted(() => {
  loadJobs()
})
onUnmounted(() => {
  clearPollTimer()
})
watch(() => props.connectionId, () => {
  views.value = []
  selectedView.value = ''
  folderPath.value = ''
  jenkinsInfo.value = null
  loadJobs()
})
watch(() => props.initialJobName, () => {
  void selectInitialJobIfNeeded()
})
</script>

<template>
  <div class="jenkins-jobs-panel-root">
  <div class="connector-browse-panel connector-workbench-pane jenkins-jobs-panel">
    <DwInlineAlert v-if="error" density="banner" variant="error" :message="error"/>

    <div class="connector-browse-panel__body">
      <div class="connector-browse-panel__pane">
        <div class="connector-list">
          <div class="connector-list__filters jenkins-jobs-panel__filters">
            <SearchInput
                v-model="nameFilter"
                class="connector-list__filter"
                size="sm"
                :placeholder="t('explorer.jenkinsJobs.nameFilterPlaceholder')"
            />
            <button
                class="connector-list__refresh"
                type="button"
                :disabled="loading"
                @click="() => loadJobs()"
            >
              {{ t('explorer.jenkinsJobs.applyFilters') }}
            </button>
          </div>

          <nav
              v-if="views.length"
              class="jenkins-jobs-panel__views"
              :aria-label="t('explorer.jenkinsJobs.views')"
          >
            <button
                v-for="view in views"
                :key="view.name || view.url || 'view'"
                type="button"
                class="jenkins-jobs-panel__view"
                :class="{ 'is-active': selectedView === view.name }"
                :disabled="loading"
                @click="selectView(view.name || '')"
            >
              {{ view.name || t('explorer.jenkinsJobs.unnamedView') }}
            </button>
          </nav>

          <nav
              v-if="showFolderBreadcrumb"
              class="jenkins-jobs-panel__breadcrumb"
              :aria-label="t('explorer.jenkinsJobs.folderBreadcrumb')"
          >
            <button
                type="button"
                class="jenkins-jobs-panel__crumb"
                :class="{ 'is-active': breadcrumbParts.length === 0 }"
                :disabled="loading"
                @click="navigateBreadcrumb(-1)"
            >
              {{ t('explorer.jenkinsJobs.folderRoot') }}
            </button>
            <template v-for="(part, index) in breadcrumbParts" :key="`${part}-${index}`">
              <span class="jenkins-jobs-panel__crumb-sep" aria-hidden="true">/</span>
              <button
                  type="button"
                  class="jenkins-jobs-panel__crumb"
                  :class="{ 'is-active': index === breadcrumbParts.length - 1 }"
                  :disabled="loading"
                  @click="navigateBreadcrumb(index)"
              >
                {{ part }}
              </button>
            </template>
          </nav>
          <p v-else-if="nameFilter.trim()" class="jenkins-jobs-panel__search-hint">
            {{ t('explorer.jenkinsJobs.searchFlatHint') }}
          </p>

          <div
              v-if="jobs.length"
              class="jenkins-jobs-panel__main"
              :class="{ 'jenkins-jobs-panel__main--with-log': selectedBuild }"
          >
            <DwSplitPane
                class="jenkins-jobs-panel__body"
                storage-key="dw.split.jenkins-jobs"
                :default-width="420"
                :min-width="280"
                :max-width="720"
                :end-min-width="280"
                :stack-below="900"
                start-class="connector-list__scroll jenkins-jobs-panel__table-wrap"
                end-class="jenkins-jobs-panel__detail"
            >
              <template #start>
                <table class="connector-browse-panel__table">
                  <thead>
                    <tr>
                      <th>{{ t('explorer.jenkinsJobs.columns.name') }}</th>
                      <th>{{ t('explorer.jenkinsJobs.columns.status') }}</th>
                      <th>{{ t('explorer.jenkinsJobs.columns.lastResult') }}</th>
                      <th>{{ t('explorer.jenkinsJobs.columns.lastSuccess') }}</th>
                      <th>{{ t('explorer.jenkinsJobs.columns.lastFailure') }}</th>
                      <th>{{ t('explorer.jenkinsJobs.columns.duration') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                        v-for="job in jobs"
                        :key="jobRowKey(job)"
                        :class="{
                          'is-selected': !job.folder && (selectedJob?.fullName || selectedJob?.name) === (job.fullName || job.name),
                          'is-folder': job.folder,
                        }"
                        @click="onJobRowClick(job)"
                    >
                      <td>
                        <span class="jenkins-jobs-panel__name-cell">
                          <span v-if="job.folder" class="jenkins-jobs-panel__folder-tag">{{ t('explorer.jenkinsJobs.folderTag') }}</span>
                          {{ job.name || job.fullName || '—' }}
                          <span v-if="job.folder" class="jenkins-jobs-panel__folder-hint">›</span>
                        </span>
                      </td>
                      <td>
                        <span v-if="job.folder" class="jenkins-jobs-panel__badge">{{ t('explorer.jenkinsJobs.folderTag') }}</span>
                        <span v-else class="jenkins-jobs-panel__badge">{{ jobListStatusLabel(job.color) }}</span>
                      </td>
                      <td>
                        <template v-if="job.folder">—</template>
                        <span
                            v-else
                            class="jenkins-jobs-panel__badge"
                            :class="{ 'is-building': job.lastBuildBuilding }"
                        >
                          {{ jobListResult(job) }}
                          <template v-if="job.lastBuildNumber"> #{{ job.lastBuildNumber }}</template>
                        </span>
                      </td>
                      <td>{{ job.folder ? '—' : formatJenkinsRelativeTime(job.lastSuccessTimestamp) }}</td>
                      <td>{{ job.folder ? '—' : formatJenkinsRelativeTime(job.lastFailureTimestamp) }}</td>
                      <td>{{ job.folder ? '—' : formatJenkinsDuration(job.lastBuildDuration ?? 0) }}</td>
                    </tr>
                  </tbody>
                </table>
              </template>

              <template #end>
              <template v-if="selectedJob">
                <div class="connector-list__foot connector-list__foot--head">
                  <strong>{{ t('explorer.jenkinsJobs.detailTitle') }}</strong>
                </div>
                <div class="jenkins-jobs-panel__detail-body">
                  <dl>
                    <div>
                      <dt>{{ t('explorer.jenkinsJobs.columns.name') }}</dt>
                      <dd>{{ selectedJob.fullName || selectedJob.name || '—' }}</dd>
                    </div>
                    <div>
                      <dt>{{ t('explorer.jenkinsJobs.columns.status') }}</dt>
                      <dd class="jenkins-jobs-panel__status">{{ jobStatusLabel }}</dd>
                    </div>
                    <div v-if="selectedJob.url">
                      <dt>URL</dt>
                      <dd><a :href="selectedJob.url" target="_blank" rel="noreferrer">{{ selectedJob.url }}</a></dd>
                    </div>
                    <div v-if="selectedJob.description">
                      <dt>{{ t('explorer.jenkinsJobs.description') }}</dt>
                      <dd>{{ selectedJob.description }}</dd>
                    </div>
                  </dl>
                  <p v-if="detailLoading" class="jenkins-jobs-panel__detail-loading">{{ t('explorer.jenkinsJobs.loadingDetail') }}</p>

                  <div class="jenkins-jobs-panel__ops">
                    <DwButton
                        size="sm"
                        variant="primary"
                        :disabled="mutationLoading || polling || !selectedJob.buildable"
                        @click="requestTriggerSelected"
                    >
                      {{ t('explorer.jenkinsJobs.triggerAction') }}
                    </DwButton>
                    <DwButton
                        size="sm"
                        variant="danger"
                        :disabled="mutationLoading || !canStopSelected"
                        @click="requestStopSelected"
                    >
                      {{ t('explorer.jenkinsJobs.stopAction') }}
                    </DwButton>
                    <span class="jenkins-jobs-panel__ops-sep" aria-hidden="true"/>
                    <IconButton
                        size="sm"
                        class="jenkins-jobs-panel__ops-icon"
                        :title="t('explorer.jenkinsJobs.refreshDetail')"
                        :disabled="detailLoading || !selectedJob"
                        @click="refresh"
                    >
                      <DwIcon name="refresh" size="sm"/>
                    </IconButton>
                    <IconButton
                        v-if="selectedBuild"
                        size="sm"
                        class="jenkins-jobs-panel__ops-icon"
                        :title="t('common.logViewer.openFullscreen')"
                        @click="logViewerRef?.openFullscreen()"
                    >
                      <DwIcon name="fullscreen" size="sm"/>
                    </IconButton>
                  </div>

                  <div v-if="selectedJob.builds?.length" class="jenkins-jobs-panel__builds">
                    <h4>{{ t('explorer.jenkinsJobs.recentBuilds') }}</h4>
                    <div class="jenkins-jobs-panel__builds-scroll">
                      <table class="connector-browse-panel__table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>{{ t('explorer.jenkinsJobs.columns.result') }}</th>
                            <th>{{ t('explorer.jenkinsJobs.columns.started') }}</th>
                            <th>{{ t('explorer.jenkinsJobs.columns.duration') }}</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr
                              v-for="build in selectedJob.builds"
                              :key="build.number"
                              :class="{ 'is-selected': selectedBuild?.number === build.number }"
                              @click="selectBuild(build)"
                          >
                            <td>{{ build.number }}</td>
                            <td>
                              <span
                                  class="jenkins-jobs-panel__badge"
                                  :class="{ 'is-building': build.building }"
                              >
                                {{ build.building ? t('explorer.jenkinsJobs.statusBuilding') : localizeJenkinsStatus(build.result) }}
                              </span>
                            </td>
                            <td>{{ formatJenkinsTimestamp(build.timestamp) }}</td>
                            <td>{{ formatJenkinsDuration(build.duration) }}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </template>
              <div v-else class="jenkins-jobs-panel__detail-body">
                <p class="jenkins-jobs-panel__detail-loading">{{ t('explorer.jenkinsJobs.detailTitle') }}</p>
              </div>
              </template>
            </DwSplitPane>

            <DwLogViewer
                v-if="selectedBuild"
                ref="logViewerRef"
                class="jenkins-jobs-panel__console"
                card
                :content="buildLog"
                :title="logTitle"
                :subtitle="logSubtitle"
                :loading="logLoading"
                :live="polling"
                :live-label="t('explorer.jenkinsJobs.liveLog')"
                v-model:follow="followLatest"
                @copied="onLogCopied"
            />
          </div>
          <EmptyState v-else-if="!loading" :title="t('explorer.jenkinsJobs.empty')"/>
          <div class="connector-list__foot">
            <span>{{ statusText }}</span>
            <span v-if="infoText" class="jenkins-jobs-panel__info">{{ infoText }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <JenkinsTriggerParamsDialog
      :open="triggerParamsOpen"
      :job-name="selectedJob?.fullName || selectedJob?.name || ''"
      :parameters="selectedJob?.parameterDefinitions || []"
      :loading="mutationLoading"
      @close="triggerParamsOpen = false"
      @confirm="triggerSelected"
  />

  <ConfirmDialog
      v-model:open="triggerConfirmOpen"
      :title="t('explorer.jenkinsJobs.triggerAction')"
      :message="t('explorer.jenkinsJobs.triggerConfirm', {name: selectedJob?.fullName || selectedJob?.name || ''})"
      :confirm-label="t('explorer.jenkinsJobs.triggerAction')"
      :confirm-loading="mutationLoading"
      @confirm="triggerSelected()"
  />
  <ConfirmDialog
      v-model:open="stopConfirmOpen"
      :title="t('explorer.jenkinsJobs.stopAction')"
      :message="t('explorer.jenkinsJobs.stopConfirm', {name: selectedJob?.fullName || selectedJob?.name || '', number: selectedBuild?.number ?? 0})"
      :confirm-label="t('explorer.jenkinsJobs.stopAction')"
      :confirm-loading="mutationLoading"
      confirm-variant="danger"
      @confirm="stopSelected"
  />
  </div>
</template>

<style scoped>
.jenkins-jobs-panel-root {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.jenkins-jobs-panel {
  min-height: 0;
  height: 100%;
}

.jenkins-jobs-panel__filters {
  grid-template-columns: minmax(10rem, 1fr) auto;
}

.jenkins-jobs-panel__info {
  margin-left: 0.75rem;
  color: var(--dw-text-secondary);
}

.jenkins-jobs-panel__views {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  flex-shrink: 0;
  padding: 0.35rem 0.5rem;
  border-bottom: 1px solid var(--dw-border);
  max-height: 5.5rem;
  overflow: auto;
}

.jenkins-jobs-panel__breadcrumb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
  padding: 0.3rem 0.55rem;
  border-bottom: 1px solid var(--dw-border);
  font-size: var(--dw-text-xs);
}

.jenkins-jobs-panel__crumb {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--dw-primary);
  padding: 0.1rem 0.25rem;
  border-radius: var(--dw-wb-control-radius);
  cursor: pointer;
  font-size: var(--dw-text-xs);
}

.jenkins-jobs-panel__crumb.is-active {
  color: var(--dw-text);
  font-weight: 600;
  cursor: default;
}

.jenkins-jobs-panel__crumb:hover:not(:disabled):not(.is-active) {
  background: var(--dw-bg-hover);
}

.jenkins-jobs-panel__crumb-sep {
  color: var(--dw-text-muted);
}

.jenkins-jobs-panel__search-hint {
  margin: 0;
  padding: 0.3rem 0.55rem;
  border-bottom: 1px solid var(--dw-border);
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.jenkins-jobs-panel__name-cell {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}

.jenkins-jobs-panel__folder-tag {
  display: inline-flex;
  padding: 0.05rem 0.4rem;
  border-radius: var(--dw-wb-control-radius);
  background: var(--dw-warning-soft);
  color: var(--dw-warning-fg);
  font-size: var(--dw-text-xs);
}

.jenkins-jobs-panel__folder-hint {
  color: var(--dw-text-muted);
}

.jenkins-jobs-panel__table-wrap tbody tr.is-folder td {
  font-weight: 500;
}

.jenkins-jobs-panel__view {
  appearance: none;
  border: 1px solid var(--dw-border-light);
  background: var(--dw-bg-panel);
  color: var(--dw-text-muted);
  border-radius: var(--dw-wb-control-radius);
  padding: 0.2rem 0.55rem;
  font-size: var(--dw-text-xs);
  line-height: 1.3;
  cursor: pointer;
}

.jenkins-jobs-panel__view:hover:not(:disabled) {
  color: var(--dw-text);
  border-color: var(--dw-border);
}

.jenkins-jobs-panel__view.is-active {
  color: var(--dw-text);
  font-weight: 600;
  background: var(--dw-bg-muted);
  border-color: var(--dw-border);
}

.jenkins-jobs-panel__view:disabled {
  opacity: 0.6;
  cursor: default;
}

.jenkins-jobs-panel__body {
  min-height: 0;
  flex: 1;
}

.jenkins-jobs-panel__main {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 0;
  flex: 1 1 auto;
}

.jenkins-jobs-panel__main--with-log .jenkins-jobs-panel__body {
  flex: 0 1 46%;
  max-height: 52%;
}

:deep(.jenkins-jobs-panel__detail) {
  border-left: 1px solid var(--dw-border);
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--dw-bg-panel);
}

:deep(.jenkins-jobs-panel__table-wrap) {
  overflow: auto;
  min-height: 0;
}

:deep(.jenkins-jobs-panel__table-wrap) tbody tr {
  cursor: pointer;
}

:deep(.jenkins-jobs-panel__table-wrap) tbody tr.is-selected,
:deep(.jenkins-jobs-panel__table-wrap) tbody tr:hover,
.jenkins-jobs-panel__builds-scroll tbody tr.is-selected,
.jenkins-jobs-panel__builds-scroll tbody tr:hover {
  background: color-mix(in srgb, var(--dw-text) 4%, transparent);
}

.jenkins-jobs-panel__badge {
  display: inline-flex;
  padding: 0.1rem 0.45rem;
  border-radius: var(--dw-wb-control-radius);
  background: var(--dw-surface-muted);
  font-size: var(--dw-text-xs);
}

.jenkins-jobs-panel__badge.is-building {
  background: color-mix(in srgb, var(--dw-primary) 18%, transparent);
  color: var(--dw-primary);
}

.jenkins-jobs-panel__detail-body {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 0.65rem 0.75rem;
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.jenkins-jobs-panel__detail-body dl {
  display: grid;
  gap: 0.45rem;
  margin: 0;
  flex-shrink: 0;
}

.jenkins-jobs-panel__detail-body dt {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.jenkins-jobs-panel__detail-body dd {
  margin: 0.1rem 0 0;
  word-break: break-word;
  font-size: var(--dw-text-sm);
}

.jenkins-jobs-panel__status {
  white-space: nowrap;
}

.jenkins-jobs-panel__ops {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
  padding: 0.15rem 0;
}

.jenkins-jobs-panel__ops-sep {
  width: 1px;
  height: 1.1rem;
  margin: 0 0.15rem;
  background: var(--dw-border);
  flex-shrink: 0;
}

.jenkins-jobs-panel__ops-icon {
  color: var(--dw-text-secondary);
}

.jenkins-jobs-panel__ops-icon:hover:not(:disabled) {
  color: var(--dw-text);
}

.jenkins-jobs-panel__builds {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.jenkins-jobs-panel__builds-scroll {
  flex: 1;
  min-height: 7.5rem;
  overflow: auto;
}

.jenkins-jobs-panel__builds h4 {
  margin: 0;
  font-size: var(--dw-text-sm);
}

.jenkins-jobs-panel__console {
  flex: 1 1 54%;
  min-height: 13.75rem;
  border-radius: 0;
  border-top: 1px solid var(--dw-border);
  border-right: 0;
  border-bottom: 0;
  border-left: 0;
  box-shadow: none;
}

.jenkins-jobs-panel__console :deep(.dw-log-viewer__head) {
  border-radius: 0;
}

.jenkins-jobs-panel__console :deep(.dw-log-viewer--card) {
  border-radius: 0;
}

.jenkins-jobs-panel__detail-loading {
  margin: 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  flex-shrink: 0;
}

.jenkins-jobs-panel__body.dw-split-pane--stacked :deep(.jenkins-jobs-panel__detail) {
  border-left: 0;
  border-top: 1px solid var(--dw-border);
}
</style>
