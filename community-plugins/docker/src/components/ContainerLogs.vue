<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { t } from '../i18n'
import * as api from '../api'
import { startLogStream, unregisterStream } from '../streams'
import { newSessionId } from '../pullTask'
import { copyToClipboard } from '../format'
import { toast } from '../toast'
import { LogBuffer } from '../logBuffer'
import type { DockerStreamHandle } from '../types'
import Icon from './Icon.vue'

const props = defineProps<{
  connectionId: string
  containerId: string
}>()

/** Cap how much text we rebuild into the DOM per frame under flood. */
const FLUSH_CHAR_BUDGET = 256 * 1024

const buffer = new LogBuffer({ maxLines: 10_000, maxChars: 5 * 1024 * 1024 })
const pendingBuffer = new LogBuffer({ maxLines: 10_000, maxChars: 5 * 1024 * 1024 })

const pendingHint = ref(false)
const logPaused = ref(false)
const logSearch = ref('')
const logError = ref('')
const logAutoFollow = ref(true)
const hasSelection = ref(false)
const lineCount = ref(0)
const logOutput = ref<HTMLPreElement>()

let stream: DockerStreamHandle | undefined
let sessionId = ''
let rafId = 0
let dirty = false
/** Coalesce high-rate chunks before touching LogBuffer / DOM. */
let coalesce = ''
let searchTimer = 0
let appliedSearch = ''
let lastRendered = ''

function scheduleFlush() {
  dirty = true
  if (rafId) return
  rafId = requestAnimationFrame(flushFrame)
}

function flushFrame() {
  rafId = 0
  if (!dirty && !coalesce) return

  // Drain coalesce into the active buffer with a per-frame budget.
  if (coalesce) {
    if (coalesce.length <= FLUSH_CHAR_BUDGET) {
      const chunk = coalesce
      coalesce = ''
      if (logPaused.value) {
        pendingBuffer.append(chunk)
        pendingHint.value = true
      } else {
        buffer.append(chunk)
      }
    } else {
      const chunk = coalesce.slice(0, FLUSH_CHAR_BUDGET)
      coalesce = coalesce.slice(FLUSH_CHAR_BUDGET)
      if (logPaused.value) {
        pendingBuffer.append(chunk)
        pendingHint.value = true
      } else {
        buffer.append(chunk)
      }
    }
  }

  dirty = Boolean(coalesce)
  if (dirty) rafId = requestAnimationFrame(flushFrame)

  pendingHint.value = pendingBuffer.size > 0
  lineCount.value = buffer.lineCount
  paint()
}

function paint() {
  const output = logOutput.value
  if (!output) return
  const text = buffer.filter(appliedSearch)
  if (text === lastRendered) {
    if (logAutoFollow.value) scrollLogsToBottom()
    return
  }
  lastRendered = text
  // Direct DOM write avoids Vue VNode diff on multi-MB log strings.
  output.textContent = text || (logError.value ? '' : t('waitingForLogs'))
  if (logAutoFollow.value) scrollLogsToBottom()
}

function appendLive(chunk: string) {
  if (!chunk) return
  coalesce += chunk
  scheduleFlush()
}

function scrollLogsToBottom() {
  const output = logOutput.value
  if (output) output.scrollTop = output.scrollHeight
}

function handleLogScroll() {
  const output = logOutput.value
  if (!output) return
  logAutoFollow.value = output.scrollHeight - output.scrollTop - output.clientHeight < 24
}

function selectionInLogs(): string {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed) return ''
  const text = sel.toString()
  if (!text) return ''
  const node = sel.anchorNode
  if (!node || !logOutput.value?.contains(node)) return ''
  return text
}

function updateSelectionState() {
  hasSelection.value = Boolean(selectionInLogs())
}

async function copyText(text: string, okKey: string) {
  if (!text) return
  try {
    await copyToClipboard(text)
    toast(t(okKey), 1400)
  } catch {
    toast(t('copyFailed'), 3000)
  }
}

async function copySelection() {
  const text = selectionInLogs()
  hasSelection.value = Boolean(text)
  if (text) {
    await copyText(text, 'logsCopiedSelection')
    return
  }
  toast(t('logsNoSelection'), 2000)
}

async function copyVisible() {
  const text = buffer.filter(appliedSearch)
  if (!text) {
    toast(t('logsNothingToCopy'), 2000)
    return
  }
  await copyText(text, 'logsCopiedVisible')
}

function drainPending() {
  if (!pendingBuffer.size) {
    pendingHint.value = false
    return
  }
  const pending = pendingBuffer.serializeForAppend()
  pendingBuffer.clear()
  pendingHint.value = false
  buffer.append(pending)
  lineCount.value = buffer.lineCount
  scheduleFlush()
}

function onTogglePause() {
  logPaused.value = !logPaused.value
  if (!logPaused.value) drainPending()
}

function clearLogs() {
  coalesce = ''
  buffer.clear()
  pendingBuffer.clear()
  lastRendered = ''
  lineCount.value = 0
  pendingHint.value = false
  hasSelection.value = false
  paint()
}

function queueSearch(next: string) {
  logSearch.value = next
  if (searchTimer) window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => {
    searchTimer = 0
    appliedSearch = logSearch.value
    lastRendered = ''
    paint()
  }, 120)
}

async function start() {
  await stop()
  logError.value = ''
  logAutoFollow.value = true
  logPaused.value = false
  coalesce = ''
  buffer.clear()
  pendingBuffer.clear()
  lastRendered = ''
  lineCount.value = 0
  pendingHint.value = false
  appliedSearch = logSearch.value
  paint()
  sessionId = newSessionId()
  try {
    stream = startLogStream(sessionId, (event) => {
      if (event.chunk) appendLive(event.chunk)
      if (event.error) {
        logError.value = event.error
        paint()
      }
      if (event.done) stream = undefined
    })
    await api.startLogs(props.connectionId, props.containerId, { tail: 500, timestamps: false }, sessionId)
  } catch (cause: any) {
    unregisterStream(sessionId)
    stream = undefined
    logError.value = cause?.message || String(cause)
    paint()
  }
}

async function stop() {
  const current = stream
  stream = undefined
  if (sessionId) unregisterStream(sessionId)
  sessionId = ''
  if (current) await current.stop().catch(() => undefined)
}

function onKeydown(event: KeyboardEvent) {
  const mod = event.ctrlKey || event.metaKey
  if (!mod) return
  const key = event.key.toLowerCase()
  if (key === 'c' && event.shiftKey) {
    // Ctrl/Cmd+Shift+C → copy currently visible (filtered) logs
    if (!logOutput.value) return
    event.preventDefault()
    void copyVisible()
    return
  }
  if (key === 'c' && !event.shiftKey) {
    const text = selectionInLogs()
    if (!text) return
    // Native copy still runs; we only toast when selection is inside the log pane.
    hasSelection.value = true
    toast(t('logsCopiedSelection'), 1200)
  }
}

onMounted(() => {
  document.addEventListener('selectionchange', updateSelectionState)
  window.addEventListener('keydown', onKeydown)
  void start()
})

onUnmounted(() => {
  document.removeEventListener('selectionchange', updateSelectionState)
  window.removeEventListener('keydown', onKeydown)
  if (rafId) cancelAnimationFrame(rafId)
  if (searchTimer) window.clearTimeout(searchTimer)
  void stop()
})

watch(
  () => [props.connectionId, props.containerId] as const,
  () => {
    void start()
  },
)

watch(logAutoFollow, (on) => {
  if (on) void nextTick(scrollLogsToBottom)
})
</script>

<template>
  <div class="logs-pane">
    <div class="logs-toolbar">
      <div class="search-box">
        <Icon name="search" class="search-icon" />
        <input
          class="input search-input"
          :value="logSearch"
          :placeholder="t('searchLogs')"
          @input="queueSearch(($event.target as HTMLInputElement).value)"
        />
      </div>
      <button class="btn btn-outline btn-sm" @click="onTogglePause">
        <Icon :name="logPaused ? 'play' : 'pause'" />{{ logPaused ? t('resume') : t('pause') }}
      </button>
      <label class="check-label">
        <input v-model="logAutoFollow" type="checkbox" />
        {{ t('autoFollowLogs') }}
      </label>
      <button class="btn btn-outline btn-sm" :disabled="!hasSelection" :title="t('copySelection')" @click="copySelection">
        <Icon name="copy" />{{ t('copySelection') }}
      </button>
      <button class="btn btn-outline btn-sm" :title="t('copyVisibleLogsHint')" @click="copyVisible">
        <Icon name="copy" />{{ t('copyVisibleLogs') }}
      </button>
      <button class="btn btn-outline btn-sm" @click="clearLogs">{{ t('clear') }}</button>
      <span class="logs-meta mono-xs">{{ t('logsLineCount', { count: lineCount }) }}</span>
      <span v-if="pendingHint" class="warn-text">{{ t('bufferedLogs') }}</span>
    </div>
    <div v-if="logError" class="error-text">{{ logError }}</div>
    <pre
      ref="logOutput"
      class="log-output"
      tabindex="0"
      @scroll.passive="handleLogScroll"
      @mouseup="updateSelectionState"
      @keyup="updateSelectionState"
    />
  </div>
</template>
