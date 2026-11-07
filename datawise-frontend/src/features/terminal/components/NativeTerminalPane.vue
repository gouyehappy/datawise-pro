<script setup lang="ts">
import {FitAddon} from '@xterm/addon-fit'
import {Terminal} from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import {nextTick, onMounted, onUnmounted, ref, shallowRef} from 'vue'
import {useI18n} from 'vue-i18n'
import {getNativeTerminalBridge, getTerminalBridge} from '@/features/terminal/services/native-terminal'
import {buildXtermTheme} from '@/features/terminal/services/terminal-palette'
import {resolveScaledTerminalFontSize} from '@/shared/config/terminal-font-size'
import {
    isTerminalTabKey,
    terminalTabPayload,
} from '@/features/terminal/services/terminal-tab-keys'
import {
    isTerminalSuspendKey,
    resolveSshTerminalKeyAction,
    terminalSuspendPayload,
} from '@/features/terminal/services/ssh-terminal-keys'
import {
    canReadClipboard,
    canWriteClipboard,
    readClipboardText,
    writeClipboardText,
} from '@/shared/browser/app-clipboard'
import {normalizePtyInput} from '@/features/terminal/services/terminal-ws-codec'
import {createTerminalOutputWriter} from '@/features/terminal/services/terminal-output-writer'

const containerRef = ref<HTMLElement>()
const term = shallowRef<Terminal | null>(null)
const sessionId = crypto.randomUUID()
const {t} = useI18n()

let fitAddon: FitAddon | null = null
let resizeObserver: ResizeObserver | null = null
let offOutput: (() => void) | null = null
let offExit: (() => void) | null = null
let outputWriter: ReturnType<typeof createTerminalOutputWriter> | null = null
let activeBridge: Awaited<ReturnType<typeof getTerminalBridge>> | null = null
let sessionReady = false

function fitTerminal() {
  if (!fitAddon || !term.value || !containerRef.value) return
  fitAddon.fit()
  if (activeBridge && term.value.cols > 0 && term.value.rows > 0) {
    void activeBridge.resize(sessionId, term.value.cols, term.value.rows)
  }
}

function clearTerminal() {
  const isWin = window.datawise?.platform === 'win32'
  if (activeBridge) void activeBridge.write(sessionId, isWin ? 'cls\r' : 'clear\r')
  term.value?.clear()
}

function focusTerminal() {
  term.value?.focus()
}

function xtermHelperTextarea(): HTMLTextAreaElement | null {
  return containerRef.value?.querySelector('textarea.xterm-helper-textarea') ?? null
}

function onTerminalKeydownCapture(event: KeyboardEvent) {
  if (!sessionReady || !activeBridge) return

  if (isTerminalTabKey(event)) {
    event.preventDefault()
    const helper = xtermHelperTextarea()
    if (helper && document.activeElement === helper) return
    event.stopPropagation()
    term.value?.focus()
    void activeBridge.write(sessionId, terminalTabPayload(event.shiftKey))
    return
  }

  if (isTerminalSuspendKey(event)) {
    event.preventDefault()
    const helper = xtermHelperTextarea()
    if (helper && document.activeElement === helper) return
    event.stopPropagation()
    term.value?.focus()
    void activeBridge.write(sessionId, terminalSuspendPayload())
  }
}

function onPaneFocusIn() {
  if (sessionReady) focusTerminal()
}

function onWindowFocus() {
  if (sessionReady && document.visibilityState === 'visible') focusTerminal()
}

async function pasteFromClipboard(): Promise<boolean> {
  const text = await readClipboardText()
  if (text == null || text === '') return false
  const normalized = normalizePtyInput(text)
  if (term.value) {
    try {
      term.value.paste(normalized)
      return true
    } catch {
      // fall through
    }
  }
  if (!activeBridge || !sessionReady) return false
  return activeBridge.write(sessionId, normalized)
}

async function copySelection(): Promise<boolean> {
  const selection = term.value?.getSelection() ?? ''
  if (!selection) return false
  return writeClipboardText(selection)
}

onMounted(async () => {
  window.addEventListener('focus', onWindowFocus)
  activeBridge = getNativeTerminalBridge() ?? await getTerminalBridge()
  const bridge = activeBridge
  if (!bridge || !containerRef.value) return

  fitAddon = new FitAddon()
  const terminal = new Terminal({
    cursorBlink: true,
    fontFamily: 'Consolas, "Cascadia Mono", "Courier New", monospace',
    fontSize: resolveScaledTerminalFontSize(),
    lineHeight: 1.25,
    scrollback: 4000,
    smoothScrollDuration: 0,
    theme: buildXtermTheme(),
  })

  terminal.loadAddon(fitAddon)
  terminal.open(containerRef.value)
  await nextTick()
  fitTerminal()

  const created = await bridge.create(sessionId, {
    cols: terminal.cols,
    rows: terminal.rows,
  })

  if (!created.ok) {
    terminal.writeln(`\x1b[31m${created.error ?? t('terminal.nativeFailed')}\x1b[0m`)
    term.value = terminal
    terminal.focus()
    return
  }

  outputWriter?.dispose()
  outputWriter = createTerminalOutputWriter((data, done) => {
    terminal.write(data, done)
  })
  offOutput = bridge.onOutput(sessionId, (data) => {
    outputWriter?.push(data)
  })
  offExit = bridge.onExit(sessionId, (code) => {
    sessionReady = false
    outputWriter?.flush()
    terminal.writeln(`\r\n\x1b[90m[${t('terminal.processExit', {code})}]\x1b[0m`)
  })

  terminal.onData((data) => {
    void bridge.write(sessionId, data)
  })
  terminal.attachCustomKeyEventHandler((event) => {
    if (event.type !== 'keydown') return true
    const action = resolveSshTerminalKeyAction(event, {
      hasSelection: !!terminal.getSelection(),
      canWriteClipboard: canWriteClipboard(),
      canReadClipboard: canReadClipboard(),
    })
    switch (action.type) {
      case 'prevent-and-pass':
        event.preventDefault()
        return true
      case 'copy':
        event.preventDefault()
        void copySelection()
        return false
      case 'paste':
        event.preventDefault()
        void pasteFromClipboard()
        return false
      case 'suspend':
        event.preventDefault()
        void activeBridge?.write(sessionId, terminalSuspendPayload())
        return false
      default:
        return true
    }
  })

  resizeObserver = new ResizeObserver(() => fitTerminal())
  resizeObserver.observe(containerRef.value)

  term.value = terminal
  sessionReady = true
  terminal.focus()
})

onUnmounted(() => {
  window.removeEventListener('focus', onWindowFocus)
  sessionReady = false
  resizeObserver?.disconnect()
  offOutput?.()
  offExit?.()
  outputWriter?.dispose()
  outputWriter = null
  if (activeBridge) void activeBridge.destroy(sessionId)
  activeBridge = null
  term.value?.dispose()
  term.value = null
})

defineExpose({focus: focusTerminal, clear: clearTerminal})
</script>

<template>
  <div
      ref="containerRef"
      class="native-terminal"
      tabindex="0"
      @click="focusTerminal"
      @focusin="onPaneFocusIn"
      @keydown.capture="onTerminalKeydownCapture"
  />
</template>

<style scoped>
.native-terminal {
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: var(--dw-space-2) var(--dw-space-1) var(--dw-space-1);
  background: var(--dw-terminal-bg);
  outline: none;
}

.native-terminal :deep(.xterm) {
  height: 100%;
}

.native-terminal :deep(.xterm-viewport) {
  scrollbar-width: thin;
  scrollbar-color: var(--dw-scrollbar-thumb) var(--dw-scrollbar-track);
}
</style>
