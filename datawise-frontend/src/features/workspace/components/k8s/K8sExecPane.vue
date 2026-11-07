<script setup lang="ts">
import {FitAddon} from '@xterm/addon-fit'
import {Terminal} from '@xterm/xterm'
import {nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {createK8sExecBridge} from '@/features/terminal/services/k8s-exec.bridge'
import {createTerminalOutputWriter} from '@/features/terminal/services/terminal-output-writer'
import {resolveScaledTerminalFontSize} from '@/shared/config/terminal-font-size'
import '@xterm/xterm/css/xterm.css'

const props = defineProps<{
  connectionId: string
  namespace: string
  podName: string
  container?: string
}>()

const {t} = useI18n()
const containerRef = ref<HTMLDivElement | null>(null)
const status = ref<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting')
const statusMessage = ref('')

let terminal: Terminal | null = null
let fitAddon: FitAddon | null = null
let bridge: ReturnType<typeof createK8sExecBridge> | null = null
let sessionId = ''
let offOutput: (() => void) | null = null
let offExit: (() => void) | null = null
let outputWriter: ReturnType<typeof createTerminalOutputWriter> | null = null
let resizeObserver: ResizeObserver | null = null

function fit() {
  if (!fitAddon || !terminal) return
  try {
    fitAddon.fit()
    if (bridge && sessionId) {
      void bridge.resize(sessionId, terminal.cols, terminal.rows)
    }
  } catch {
    // ignore
  }
}

async function start() {
  if (!props.connectionId || !props.namespace || !props.podName || !containerRef.value) return
  await teardown()
  status.value = 'connecting'
  statusMessage.value = ''
  sessionId = crypto.randomUUID()
  bridge = createK8sExecBridge(props.connectionId, {
    namespace: props.namespace,
    podName: props.podName,
    container: props.container,
  })
  fitAddon = new FitAddon()
  const css = getComputedStyle(document.documentElement)
  const terminalTheme = {
    background: css.getPropertyValue('--dw-terminal-bg').trim() || '#1a1d24',
    foreground: css.getPropertyValue('--dw-terminal-fg').trim() || '#d1d5db',
    cursor: css.getPropertyValue('--dw-terminal-cursor').trim() || '#16a34a',
    cursorAccent: css.getPropertyValue('--dw-terminal-bg').trim() || '#1a1d24',
    selectionBackground: css.getPropertyValue('--dw-terminal-selection').trim() || '#264f78',
  }
  terminal = new Terminal({
    cursorBlink: true,
    fontFamily: 'Consolas, "Cascadia Mono", "Courier New", monospace',
    fontSize: resolveScaledTerminalFontSize(),
    lineHeight: 1,
    scrollback: 4000,
    smoothScrollDuration: 0,
    theme: terminalTheme,
  })
  terminal.loadAddon(fitAddon)
  terminal.open(containerRef.value)
  await nextTick()
  fit()
  outputWriter?.dispose()
  outputWriter = createTerminalOutputWriter((data, done) => {
    terminal?.write(data, done)
  })
  offOutput = bridge.onOutput(sessionId, (data) => outputWriter?.push(data))
  offExit = bridge.onExit(sessionId, (code) => {
    outputWriter?.flush()
    terminal?.writeln(`\r\n\x1b[90m[exit ${code}]\x1b[0m`)
    status.value = 'disconnected'
    statusMessage.value = t('explorer.k8sExec.disconnected')
  })
  terminal.onData((data) => {
    void bridge?.write(sessionId, data)
  })
  const created = await bridge.create(sessionId, {
    cols: terminal.cols,
    rows: terminal.rows,
  })
  if (!created.ok) {
    status.value = 'error'
    statusMessage.value = created.error || t('explorer.k8sExec.connectFailed')
    terminal.writeln(`\r\n\x1b[31m${statusMessage.value}\x1b[0m`)
    return
  }
  status.value = 'connected'
  resizeObserver = new ResizeObserver(() => fit())
  resizeObserver.observe(containerRef.value)
}

async function teardown() {
  offOutput?.()
  offExit?.()
  offOutput = null
  offExit = null
  outputWriter?.dispose()
  outputWriter = null
  resizeObserver?.disconnect()
  resizeObserver = null
  if (bridge && sessionId) {
    await bridge.destroy(sessionId)
  }
  bridge = null
  sessionId = ''
  terminal?.dispose()
  terminal = null
  fitAddon = null
}

onMounted(() => {
  void start()
})

onBeforeUnmount(() => {
  void teardown()
})

watch(
    () => [props.connectionId, props.namespace, props.podName, props.container],
    () => {
      void start()
    },
)
</script>

<template>
  <div class="k8s-exec-pane">
    <div class="k8s-exec-pane__status">
      <span>{{ namespace }}/{{ podName }}<template v-if="container"> · {{ container }}</template></span>
      <span>{{ statusMessage || status }}</span>
    </div>
    <div ref="containerRef" class="k8s-exec-pane__term"/>
  </div>
</template>

<style scoped>
.k8s-exec-pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  gap: var(--dw-space-2);
}

.k8s-exec-pane__status {
  display: flex;
  justify-content: space-between;
  gap: var(--dw-space-3);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
}

.k8s-exec-pane__term {
  flex: 1;
  min-height: 0;
  border-radius: var(--dw-panel-radius);
  overflow: hidden;
  background: var(--dw-terminal-bg);
  padding: 4px;
}
</style>
