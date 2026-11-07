<script setup lang="ts">
import {FitAddon} from '@xterm/addon-fit'
import {Terminal} from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import {nextTick, onActivated, onDeactivated, onMounted, onUnmounted, ref, shallowRef, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {createSshTerminalBridge} from '@/features/terminal/services/ssh-terminal.bridge'
import {
    registerSshTerminalHandle,
    unregisterSshTerminalHandle,
    type SshTerminalStatus,
} from '@/features/terminal/services/ssh-terminal-session.service'
import {
    classifySshTerminalFailure,
    localizeSshTerminalError,
    SSH_AUTO_RECONNECT_MAX_ATTEMPTS,
    sshAutoReconnectDelayMs,
} from '@/features/terminal/services/ssh-terminal-failure'
import {
    adjustSshTerminalFontSize,
    applyTerminalFontSize,
    resetSshTerminalFontSize,
    readSshTerminalFontSize,
} from '@/features/terminal/services/ssh-terminal-font.service'
import {
    attachSshTerminalAddons,
    clearSearchAddon,
    exportTerminalPlainText,
    findWithSearchAddon,
    type SshTerminalAddonHandles,
} from '@/features/terminal/services/ssh-terminal-addons.service'
import {findInTerminal} from '@/features/terminal/services/ssh-terminal-search.service'
import {
    canReadClipboard,
    canWriteClipboard,
    readClipboardText,
    writeClipboardText,
} from '@/shared/browser/app-clipboard'
import {buildXtermTheme} from '@/features/terminal/services/terminal-palette'
import {
    isTerminalTabKey,
    terminalTabPayload,
} from '@/features/terminal/services/terminal-tab-keys'
import {
    isTerminalSuspendKey,
    resolveSshTerminalKeyAction,
    terminalSuspendPayload,
} from '@/features/terminal/services/ssh-terminal-keys'
import {normalizePtyInput} from '@/features/terminal/services/terminal-ws-codec'
import {createTerminalOutputWriter} from '@/features/terminal/services/terminal-output-writer'

const props = defineProps<{
  connectionId: string
  tabId: string
  tabLabel: string
  autoReconnect?: boolean
}>()

const emit = defineEmits<{
  statusChange: [status: SshTerminalStatus, message?: string]
  saveSelection: []
  contextMenu: [event: MouseEvent]
  openSearch: []
}>()

const containerRef = ref<HTMLElement>()
const term = shallowRef<Terminal | null>(null)
const status = ref<SshTerminalStatus>('connecting')
const statusMessage = ref('')
const fontSize = ref(readSshTerminalFontSize())
const {t} = useI18n()

let sessionId = crypto.randomUUID()
let fitAddon: FitAddon | null = null
let terminalAddons: SshTerminalAddonHandles | null = null
let resizeObserver: ResizeObserver | null = null
let offOutput: (() => void) | null = null
let offExit: (() => void) | null = null
let offDrop: (() => void) | null = null
let offResume: (() => void) | null = null
let outputWriter: ReturnType<typeof createTerminalOutputWriter> | null = null
let bridge: ReturnType<typeof createSshTerminalBridge> | null = null
let starting = false
let startGeneration = 0
let autoReconnectTimer: ReturnType<typeof setTimeout> | null = null
let fitDebounceTimer: ReturnType<typeof setTimeout> | null = null
let postConnectFitTimer: ReturnType<typeof setTimeout> | null = null
let lastReportedSize = {cols: 0, rows: 0}
/** KeepAlive: only reclaim focus while this pane is the active cached tab. */
let paneActive = true
/** 1-based count of scheduled auto-reconnect attempts since last healthy connect. */
let autoReconnectAttempt = 0

function setStatus(next: SshTerminalStatus, message = '') {
  status.value = next
  statusMessage.value = message
  emit('statusChange', next, message)
}

function waitFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

/** Wait until the pane has a real, stable box — first paint is often a short transient size. */
async function waitForStableLayout(el: HTMLElement, timeoutMs = 1500) {
  const started = performance.now()
  let lastW = 0
  let lastH = 0
  let stableFrames = 0
  while (performance.now() - started < timeoutMs) {
    const w = el.clientWidth
    const h = el.clientHeight
    if (w >= 80 && h >= 80) {
      if (w === lastW && h === lastH) {
        stableFrames += 1
        if (stableFrames >= 2) return
      } else {
        stableFrames = 0
        lastW = w
        lastH = h
      }
    }
    await waitFrame()
  }
}

function reportPtySize(force = false) {
  if (!term.value || !bridge || status.value !== 'connected') return
  const cols = Math.max(term.value.cols, 20)
  const rows = Math.max(term.value.rows, 8)
  if (!force && cols === lastReportedSize.cols && rows === lastReportedSize.rows) return
  lastReportedSize = {cols, rows}
  void bridge.resize(sessionId, cols, rows)
}

function fitTerminal(forceReport = false) {
  if (!fitAddon || !term.value || !containerRef.value) return
  if (containerRef.value.clientWidth < 40 || containerRef.value.clientHeight < 40) return
  try {
    fitAddon.fit()
  } catch {
    return
  }
  // Overflow trim uses layout reads — only on forced fits (connect / explicit refit),
  // not on every ResizeObserver tick during drag (JCEF layout is expensive).
  if (forceReport) {
    const host = containerRef.value
    const screen = term.value.element
    if (screen && term.value.rows > 8) {
      const overflow =
          screen.getBoundingClientRect().bottom - host.getBoundingClientRect().bottom
      const cellHeight = term.value.rows > 0
          ? screen.getBoundingClientRect().height / term.value.rows
          : 16
      if (overflow > cellHeight * 0.6) {
        term.value.resize(term.value.cols, term.value.rows - 1)
      }
    }
  }
  reportPtySize(forceReport)
}

function scheduleFit(forceReport = false) {
  if (fitDebounceTimer) clearTimeout(fitDebounceTimer)
  fitDebounceTimer = setTimeout(() => {
    fitDebounceTimer = null
    fitTerminal(forceReport)
  }, 80)
}

function scheduleSettledFits() {
  // rAF + debounce + delayed pass covers post-connect layout (fonts, quick-ops, tab chrome).
  requestAnimationFrame(() => fitTerminal(true))
  scheduleFit(true)
  if (postConnectFitTimer) clearTimeout(postConnectFitTimer)
  postConnectFitTimer = setTimeout(() => {
    postConnectFitTimer = null
    fitTerminal(true)
  }, 160)
}

function clearAutoReconnectTimer() {
  if (autoReconnectTimer) {
    clearTimeout(autoReconnectTimer)
    autoReconnectTimer = null
  }
}

function resetAutoReconnectAttempts() {
  autoReconnectAttempt = 0
}

function scheduleAutoReconnect(failureMessage?: string) {
  clearAutoReconnectTimer()
  if (!props.autoReconnect || starting) return
  if (status.value !== 'disconnected' && status.value !== 'error') return

  const classified = classifySshTerminalFailure(failureMessage ?? statusMessage.value)
  if (!classified.shouldAutoReconnect) {
    return
  }
  if (autoReconnectAttempt >= SSH_AUTO_RECONNECT_MAX_ATTEMPTS) {
    setStatus(
        'error',
        t('terminal.sshAutoReconnectStopped', {max: SSH_AUTO_RECONNECT_MAX_ATTEMPTS}),
    )
    return
  }

  autoReconnectAttempt += 1
  const attempt = autoReconnectAttempt
  const delayMs = sshAutoReconnectDelayMs(attempt)
  const seconds = Math.max(1, Math.round(delayMs / 1000))
  // Stay on error/disconnected with a countdown message — avoids connecting flicker.
  statusMessage.value = t('terminal.sshWillRetry', {
    seconds,
    attempt,
    max: SSH_AUTO_RECONNECT_MAX_ATTEMPTS,
  })
  emit('statusChange', status.value, statusMessage.value)

  autoReconnectTimer = setTimeout(() => {
    autoReconnectTimer = null
    if (!props.autoReconnect) return
    setStatus(
        'connecting',
        t('terminal.sshReconnectingAttempt', {
          attempt,
          max: SSH_AUTO_RECONNECT_MAX_ATTEMPTS,
        }),
    )
    void reconnect()
  }, delayMs)
}

function applyFailureStatus(rawMessage: string | undefined, fallbackKey: 'sshFailed' | 'sshDisconnected') {
  const message = localizeSshTerminalError(rawMessage, t, `terminal.${fallbackKey}`)
  const classified = classifySshTerminalFailure(rawMessage || message)
  if (classified.kind === 'auth') {
    setStatus('error', t('terminal.sshAuthFailedDetail', {detail: message}))
    return
  }
  if (classified.kind === 'fatal') {
    setStatus('error', message)
    return
  }
  if (classified.kind === 'transient') {
    setStatus('error', t('terminal.sshNetworkFailedDetail', {detail: message}))
  } else {
    setStatus('error', message)
  }
  scheduleAutoReconnect(message)
}

async function teardown(abortInFlight = false) {
  clearAutoReconnectTimer()
  if (fitDebounceTimer) {
    clearTimeout(fitDebounceTimer)
    fitDebounceTimer = null
  }
  if (postConnectFitTimer) {
    clearTimeout(postConnectFitTimer)
    postConnectFitTimer = null
  }
  resizeObserver?.disconnect()
  resizeObserver = null
  offOutput?.()
  offOutput = null
  // Detach exit first so intentional destroy does not look like a dropped shell.
  offExit?.()
  offExit = null
  offDrop?.()
  offDrop = null
  offResume?.()
  offResume = null
  outputWriter?.dispose()
  outputWriter = null
  if (abortInFlight) {
    startGeneration += 1
    starting = false
  }
  if (bridge) {
    await bridge.destroy(sessionId)
  }
  bridge = null
  terminalAddons?.dispose()
  terminalAddons = null
  term.value?.dispose()
  term.value = null
  fitAddon = null
  lastReportedSize = {cols: 0, rows: 0}
}

async function startSession() {
  if (!props.connectionId || !containerRef.value) return
  const generation = ++startGeneration
  starting = true
  setStatus('connecting')
  try {
    await teardown()
    if (generation !== startGeneration || !containerRef.value) return
    await waitForStableLayout(containerRef.value)
    if (generation !== startGeneration || !containerRef.value) return
    sessionId = crypto.randomUUID()
    bridge = createSshTerminalBridge(props.connectionId)
    fitAddon = new FitAddon()
    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: 'Consolas, "Cascadia Mono", "Courier New", monospace',
      fontSize: fontSize.value,
      // Integer row math for FitAddon — lineHeight > 1 clipped the bottom prompt.
      lineHeight: 1,
      scrollback: 4000,
      // Snappier under flood; smooth scroll costs JCEF frames.
      smoothScrollDuration: 0,
      // xterm canvas/WebGL cannot resolve CSS variables — concrete colors from terminal-palette.
      theme: buildXtermTheme(),
    })

    terminal.loadAddon(fitAddon)
    terminal.open(containerRef.value)
    try {
      terminalAddons = attachSshTerminalAddons(terminal)
    } catch {
      terminalAddons = null
    }
    await nextTick()
    if (generation !== startGeneration || !containerRef.value) return
    // Layout can still settle after xterm mounts (toolbar / quick-ops chrome).
    await waitForStableLayout(containerRef.value)
    if (generation !== startGeneration) return
    fitTerminal()
    await waitFrame()
    if (generation !== startGeneration) return
    fitTerminal()

    // Register before create — shell prompt/MOTD can arrive immediately after PTY opens.
    outputWriter?.dispose()
    outputWriter = createTerminalOutputWriter((data, done) => {
      terminal.write(data, done)
    })
    offOutput = bridge.onOutput(sessionId, (data) => outputWriter?.push(data))
    offExit = bridge.onExit(sessionId, (code) => {
      outputWriter?.flush()
      terminal.writeln(`\r\n\x1b[90m[${t('terminal.processExit', {code})}]\x1b[0m`)
      setStatus('disconnected', t('terminal.sshDisconnected'))
      scheduleAutoReconnect(t('terminal.sshDisconnected'))
    })
    offDrop = bridge.onTransportDrop(sessionId, () => {
      // Keep the xterm buffer; bridge will resume the same sessionId within grace.
      if (status.value === 'connected') {
        statusMessage.value = t('terminal.sshResuming')
      }
    })
    offResume = bridge.onTransportResume(sessionId, () => {
      if (status.value === 'connected' || status.value === 'connecting') {
        setStatus('connected')
      }
    })

    terminal.onData((data) => {
      void bridge?.write(sessionId, data)
    })

    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true
      const action = resolveSshTerminalKeyAction(event, {
        hasSelection: !!getSelection(),
        canWriteClipboard: canWriteClipboard(),
        canReadClipboard: canReadClipboard(),
      })
      switch (action.type) {
        case 'prevent-and-pass':
          event.preventDefault()
          return true
        case 'search':
          event.preventDefault()
          emit('openSearch')
          return false
        case 'copy':
          event.preventDefault()
          void copySelection()
          return false
        case 'paste':
          event.preventDefault()
          void pasteFromClipboard()
          return false
        case 'save-selection':
          event.preventDefault()
          emit('saveSelection')
          return false
        case 'suspend':
          // Explicit ^Z — browser/CEF Undo must not win over remote SIGTSTP (tail -f, etc.).
          event.preventDefault()
          void bridge?.write(sessionId, terminalSuspendPayload())
          return false
        default:
          return true
      }
    })

    term.value = terminal

    // Match the remote PTY to the visible pane — don't advertise a taller terminal
    // than FitAddon actually rendered, or menus scroll until only the bottom shows.
    const cols = Math.max(terminal.cols, 40)
    const rows = Math.max(terminal.rows, 12)
    const created = await bridge.create(sessionId, {cols, rows})
    if (generation !== startGeneration) return
    lastReportedSize = {cols, rows}

    if (!created.ok) {
      const err = localizeSshTerminalError(created.error, t)
      terminal.writeln(`\x1b[31m${err}\x1b[0m`)
      applyFailureStatus(created.error, 'sshFailed')
      return
    }

    // Observe resize only after create succeeds — early resize hit requireOwner and closed the WS.
    resizeObserver = new ResizeObserver(() => scheduleFit())
    resizeObserver.observe(containerRef.value)

    resetAutoReconnectAttempts()
    setStatus('connected')
    await nextTick()
    // Force a post-connect resize so JumpServer sees the settled pane size, not a short first paint.
    fitTerminal(true)
    scheduleSettledFits()
    terminal.scrollToBottom()
    terminal.focus()
  } catch (error) {
    if (generation !== startGeneration) return
    const message = error instanceof Error && error.message
        ? error.message
        : t('terminal.sshFailed')
    term.value?.writeln(`\x1b[31m${message}\x1b[0m`)
    applyFailureStatus(message, 'sshFailed')
  } finally {
    if (generation === startGeneration) {
      starting = false
    }
  }
}

function clearTerminal() {
  term.value?.clear()
  clearSearchAddon(terminalAddons?.search ?? null)
}

function focusTerminal() {
  term.value?.focus()
}

function xtermHelperTextarea(): HTMLTextAreaElement | null {
  return containerRef.value?.querySelector('textarea.xterm-helper-textarea') ?? null
}

/**
 * Capture Tab / Ctrl+Z before the browser steals them (focus escape / Undo).
 * If xterm's helper textarea is not focused, refocus and inject the PTY bytes.
 */
function onTerminalKeydownCapture(event: KeyboardEvent) {
  if (status.value !== 'connected' || !bridge) return

  if (isTerminalTabKey(event)) {
    event.preventDefault()
    const helper = xtermHelperTextarea()
    if (helper && document.activeElement === helper) {
      // xterm will emit onData('\t' | CSI Z); preventDefault only blocks focus escape.
      return
    }
    event.stopPropagation()
    term.value?.focus()
    void bridge.write(sessionId, terminalTabPayload(event.shiftKey))
    return
  }

  if (isTerminalSuspendKey(event)) {
    event.preventDefault()
    const helper = xtermHelperTextarea()
    if (helper && document.activeElement === helper) {
      // attachCustomKeyEventHandler sends ^Z; preventDefault blocks Undo.
      return
    }
    event.stopPropagation()
    term.value?.focus()
    void bridge.write(sessionId, terminalSuspendPayload())
  }
}

/** Prefer xterm.paste so bracketed-paste mode works; normalize newlines for vim. */
async function pasteFromClipboard(): Promise<boolean> {
  const text = await readClipboardText()
  if (text == null || text === '') return false
  const normalized = normalizePtyInput(text)
  if (term.value) {
    try {
      term.value.paste(normalized)
      return true
    } catch {
      // fall through to raw write
    }
  }
  return sendInput(normalized)
}

function shouldReclaimFocus(): boolean {
  return paneActive && status.value === 'connected' && document.visibilityState === 'visible'
}

function onPaneFocusIn() {
  // JCEF: clicking chrome around the canvas can leave focus on the container div.
  if (shouldReclaimFocus()) {
    focusTerminal()
  }
}

function onWindowFocus() {
  // Do not steal focus from other KeepAlive tabs when the OS window refocuses.
  if (shouldReclaimFocus()) {
    focusTerminal()
  }
}

async function sendInput(text: string): Promise<boolean> {
  if (!bridge || status.value !== 'connected') return false
  if (!bridge.isOpen(sessionId)) {
    const resumed = await softResumeTransport()
    if (!resumed || !bridge?.isOpen(sessionId) || status.value !== 'connected') return false
  }
  return bridge.write(sessionId, text)
}

/** Re-open WS for the same shell without wiping xterm (backend grace window). */
async function softResumeTransport(): Promise<boolean> {
  if (!bridge || !term.value) return false
  const cols = Math.max(lastReportedSize.cols || term.value.cols || 80, 40)
  const rows = Math.max(lastReportedSize.rows || term.value.rows || 24, 12)
  statusMessage.value = t('terminal.sshResuming')
  const result = await bridge.resume(sessionId, {cols, rows})
  if (result.ok) {
    setStatus('connected')
    return true
  }
  return false
}

async function reconnect() {
  clearAutoReconnectTimer()
  resetAutoReconnectAttempts()
  await startSession()
}

/** Idle / explorer disconnect: drop the shell but keep this KeepAlive pane registrable. */
async function suspendSession() {
  await teardown(true)
  setStatus('disconnected', t('terminal.sshDisconnected'))
}

async function refreshActiveSession() {
  if (starting) return
  // After idle suspend, term is null with status disconnected — wait for explorer
  // overlay reconnect (reconnectSshTerminalsForConnection) rather than racing here.
  if (!term.value || status.value === 'connecting' || status.value === 'error') {
    if (status.value === 'disconnected') return
    await startSession()
    return
  }
  await nextTick()
  scheduleSettledFits()
  if (bridge && !bridge.isOpen(sessionId) && status.value === 'connected') {
    const resumed = await softResumeTransport()
    if (resumed) return
    setStatus('disconnected', t('terminal.sshDisconnected'))
    await reconnect()
    return
  }
  term.value.focus()
}

function getSelection(): string {
  return term.value?.getSelection() ?? ''
}

async function copySelection(): Promise<boolean> {
  const selection = getSelection()
  if (!selection) return false
  return writeClipboardText(selection)
}

function changeFontSize(delta: number) {
  fontSize.value = adjustSshTerminalFontSize(fontSize.value, delta)
  applyTerminalFontSize(term.value, fontSize.value)
  fitTerminal(true)
}

function resetFontSize() {
  fontSize.value = resetSshTerminalFontSize(term.value)
  fitTerminal(true)
}

function findNext(query: string): boolean {
  const normalized = query.trim()
  if (!normalized) return false
  const withAddon = findWithSearchAddon(terminalAddons?.search ?? null, normalized, 'next')
  if (withAddon) return true
  // Fallback when SearchAddon is unavailable / incompatible.
  return !!findInTerminal(term.value, normalized, 'next', null)
}

function findPrevious(query: string): boolean {
  const normalized = query.trim()
  if (!normalized) return false
  const withAddon = findWithSearchAddon(terminalAddons?.search ?? null, normalized, 'prev')
  if (withAddon) return true
  return !!findInTerminal(term.value, normalized, 'prev', null)
}

function resetSearch() {
  clearSearchAddon(terminalAddons?.search ?? null)
}

function getBufferText(): string {
  return exportTerminalPlainText(term.value, terminalAddons?.serialize ?? null)
}

async function copyBuffer(): Promise<boolean> {
  const text = exportTerminalPlainText(term.value, terminalAddons?.serialize ?? null)
  if (!text) return false
  return writeClipboardText(text)
}

function onContextMenu(event: MouseEvent) {
  event.preventDefault()
  emit('contextMenu', event)
}

watch(() => props.autoReconnect, (enabled) => {
  if (enabled) {
    scheduleAutoReconnect(statusMessage.value)
    return
  }
  clearAutoReconnectTimer()
  resetAutoReconnectAttempts()
})

onMounted(async () => {
  window.addEventListener('focus', onWindowFocus)
  registerSshTerminalHandle({
    tabId: props.tabId,
    connectionId: props.connectionId,
    label: props.tabLabel,
    sendInput,
    focus: focusTerminal,
    getStatus: () => status.value,
    reconnect,
    suspend: suspendSession,
    dispose: () => teardown(true),
  })
  await startSession()
})

onActivated(() => {
  paneActive = true
  void refreshActiveSession()
  if (status.value === 'connected') {
    focusTerminal()
  }
})

onDeactivated(() => {
  paneActive = false
})

onUnmounted(() => {
  paneActive = false
  window.removeEventListener('focus', onWindowFocus)
  unregisterSshTerminalHandle(props.tabId)
  void teardown(true)
})

defineExpose({
  focus: focusTerminal,
  clear: clearTerminal,
  reconnect,
  sendInput,
  getSelection,
  copySelection,
  pasteFromClipboard,
  copyBuffer,
  getBufferText,
  changeFontSize,
  resetFontSize,
  findNext,
  findPrevious,
  resetSearch,
  refit: () => fitTerminal(true),
  getFontSize: () => fontSize.value,
  getStatus: () => status.value,
})
</script>

<template>
  <div
      ref="containerRef"
      class="ssh-terminal"
      tabindex="0"
      @click="focusTerminal"
      @focusin="onPaneFocusIn"
      @keydown.capture="onTerminalKeydownCapture"
      @contextmenu="onContextMenu"
  />
</template>

<style scoped>
.ssh-terminal {
  width: 100%;
  height: 100%;
  min-height: 0;
  /* Tight inset — every pixel here is one fewer PTY row vs Xshell. */
  padding: var(--dw-space-1) var(--dw-space-3) var(--dw-space-1);
  background: var(--dw-terminal-bg);
  outline: none;
  overflow: hidden;
  box-sizing: border-box;
  border-radius: inherit;
  position: relative;
}

/* Let FitAddon own sizing — forcing 100% height leaves blank CSS below few fitted rows. */
.ssh-terminal :deep(.xterm) {
  height: auto !important;
  width: 100%;
}

.ssh-terminal :deep(.xterm-viewport) {
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.45) transparent;
}

.ssh-terminal :deep(.xterm-screen) {
  margin-bottom: 0;
}
</style>
