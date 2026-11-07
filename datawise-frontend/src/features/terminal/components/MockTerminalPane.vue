<script setup lang="ts">
import {nextTick, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useTerminalStore} from '@/features/terminal/stores/terminal'

const {t} = useI18n()
const terminal = useTerminalStore()
const outputRef = ref<HTMLElement>()
const inputRef = ref<HTMLInputElement>()
const draft = ref('')

function scrollToBottom() {
  nextTick(() => {
    const el = outputRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function submit() {
  void terminal.run(draft.value)
  draft.value = ''
  scrollToBottom()
}

function insertAtCursor(text: string) {
  const el = inputRef.value
  if (!el) {
    draft.value += text
    return
  }
  const start = el.selectionStart ?? draft.value.length
  const end = el.selectionEnd ?? start
  draft.value = `${draft.value.slice(0, start)}${text}${draft.value.slice(end)}`
  const caret = start + text.length
  nextTick(() => el.setSelectionRange(caret, caret))
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    submit()
    return
  }

  if (e.key === 'Tab') {
    e.preventDefault()
    insertAtCursor('\t')
    return
  }

  if (e.ctrlKey && e.key.toLowerCase() === 'c') {
    e.preventDefault()
    draft.value = ''
    terminal.lines.push({type: 'sys', text: '^C'})
    return
  }

  if (e.ctrlKey && e.key.toLowerCase() === 'l') {
    e.preventDefault()
    terminal.clear()
    return
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault()
    const prev = terminal.historyUp()
    if (prev !== null) draft.value = prev
    return
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    const next = terminal.historyDown()
    if (next !== null) draft.value = next
  }
}

watch(
    () => terminal.lines.length,
    () => scrollToBottom(),
)

onMounted(() => {
  void terminal.ensureBoot()
  scrollToBottom()
  inputRef.value?.focus()
})

function clearTerminal() {
  terminal.clear()
}

defineExpose({
  focus: () => inputRef.value?.focus(),
  clear: clearTerminal,
})
</script>

<template>
    <div class="mock-terminal">
    <p class="mock-terminal__banner">{{ t('terminal.mockHint') }}</p>
    <div ref="outputRef" class="mock-terminal__output">
      <div
          v-for="(line, index) in terminal.lines"
          :key="index"
          class="mock-terminal__line"
          :class="line.type"
      >
        {{ line.text }}
      </div>
    </div>
    <form class="mock-terminal__input-row" @submit.prevent="submit">
      <span class="mock-terminal__prompt">{{ terminal.promptPrefix() }}</span>
      <input
          ref="inputRef"
          v-model="draft"
          class="mock-terminal__input"
          type="text"
          spellcheck="false"
          autocomplete="off"
          autocapitalize="off"
          @keydown="onKeydown"
      />
    </form>
  </div>
</template>

<style scoped>
.mock-terminal {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 200px;
  border: 1px solid var(--dw-terminal-border);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-terminal-bg);
  color: var(--dw-terminal-fg);
  font-family: var(--dw-mono);
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading-relaxed);
  overflow: hidden;
}

.mock-terminal__banner {
  margin: 0;
  padding: var(--dw-space-3) var(--dw-space-6);
  border-bottom: 1px solid var(--dw-terminal-border);
  background: color-mix(in srgb, var(--dw-warning) 12%, var(--dw-terminal-input-bg));
  color: var(--dw-warning);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
}

.mock-terminal__output {
  flex: 1;
  overflow-y: auto;
  padding: var(--dw-space-5) var(--dw-space-6) var(--dw-space-3);
}

.mock-terminal__line {
  white-space: pre-wrap;
  word-break: break-word;
}

.mock-terminal__line.in {
  color: color-mix(in srgb, var(--dw-terminal-fg) 92%, white);
}

.mock-terminal__line.out {
  color: var(--dw-terminal-fg);
}

.mock-terminal__line.err {
  color: var(--dw-danger);
}

.mock-terminal__line.sys {
  color: var(--dw-text-muted);
}

.mock-terminal__input-row {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  padding: var(--dw-space-4) var(--dw-space-6) var(--dw-space-5);
  border-top: 1px solid var(--dw-terminal-border);
  background: var(--dw-terminal-input-bg);
}

.mock-terminal__prompt {
  flex-shrink: 0;
  color: var(--dw-success);
  font-weight: 600;
}

.mock-terminal__input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--dw-terminal-fg);
  font: inherit;
  caret-color: var(--dw-terminal-cursor);
}
</style>
