<script setup lang="ts">
import {computed, nextTick, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton, DwInput} from '@/core/components'
import {explorerApi} from '@/api'
import {
    buildRedisPlaceholderForKey,
    buildRedisQuickCommandsForKey,
    findRedisCommandHint,
    matchRedisCommandHints,
    REDIS_QUICK_COMMANDS,
    resolveRedisKeyIdleHintKey,
    type RedisCommandHint,
} from '@/features/explorer/services/redis-command-hints.service'
import type {RedisConsoleEntry} from '@/features/explorer/services/redis-console.service'
import {formatRedisConsoleEntry} from '@/features/explorer/services/redis-console.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

const props = defineProps<{
    connectionId: string
    database?: number
    selectedKey?: string | null
    selectedKeyType?: string | null
    seedCommand?: string | null
}>()

const emit = defineEmits<{
    keyDeleted: [key: string]
}>()

const {t} = useI18n()

const commandInput = ref('')
const running = ref(false)
const entries = ref<RedisConsoleEntry[]>([])
const outputRef = ref<HTMLElement>()
const inputRef = ref<{ $el?: HTMLElement } | null>(null)

function focusCommandInput() {
  const el = inputRef.value?.$el
  if (el instanceof HTMLInputElement) el.focus()
}

async function scrollOutputToBottom() {
  await nextTick()
  const el = outputRef.value
  if (el) el.scrollTop = el.scrollHeight
}

const historyIndex = ref(-1)

const outputText = computed(() =>
    entries.value.map((entry) => formatRedisConsoleEntry(entry)).join('\n\n'),
)

const commandHints = computed(() => matchRedisCommandHints(commandInput.value, 5))

const activeHint = computed(() => findRedisCommandHint(commandInput.value))

const activeHintText = computed(() => {
    if (activeHint.value) {
        return t(`explorer.redisConsole.commands.${activeHint.value.summary}`, {
            example: activeHint.value.example,
        })
    }
    if (props.selectedKey) {
        const hintKey = resolveRedisKeyIdleHintKey(props.selectedKeyType)
        return t(`explorer.redisConsole.${hintKey}`, {
            key: props.selectedKey,
            example: buildRedisPlaceholderForKey(props.selectedKey, props.selectedKeyType),
        })
    }
    return t('explorer.redisConsole.hint')
})

const contextPlaceholder = computed(() =>
    props.selectedKey
        ? buildRedisPlaceholderForKey(props.selectedKey, props.selectedKeyType)
        : t('explorer.redisConsole.placeholder'),
)

const contextQuickCommands = computed(() => {
    if (!props.selectedKey) return REDIS_QUICK_COMMANDS
    return buildRedisQuickCommandsForKey(props.selectedKey, props.selectedKeyType)
})

function parseDelTarget(command: string): string | null {
    const match = command.trim().match(/^DEL\s+(.+)$/i)
    if (!match?.[1]) return null
    const raw = match[1].trim()
    if (raw.startsWith('"') && raw.endsWith('"')) {
        return raw.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    }
    return raw
}

async function runCommand(raw?: string) {
    const command = (raw ?? commandInput.value).trim()
    if (!command || !props.connectionId || running.value) return

    running.value = true
    commandInput.value = ''
    historyIndex.value = -1

    try {
        const result = await explorerApi.executeRedisCommand(props.connectionId, command, {
            database: props.database,
        })
        entries.value.push({
            command: result.command,
            output: result.success ? result.output : (result.error ?? result.output),
            success: result.success,
            durationMs: result.durationMs,
        })
        if (result.success && /^DEL\b/i.test(command)) {
            const deletedKey = parseDelTarget(command)
            if (deletedKey) emit('keyDeleted', deletedKey)
        }
    } catch (err) {
        entries.value.push({
            command,
            output: resolveCaughtApiErrorMessage(err, t, 'explorer.redisKey.loadFailed'),
            success: false,
            durationMs: 0,
        })
    } finally {
        running.value = false
        await scrollOutputToBottom()
        focusCommandInput()
    }
}

function onInputKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
        event.preventDefault()
        void runCommand()
        return
    }
    if (event.key === 'ArrowUp') {
        event.preventDefault()
        const commands = entries.value.map((entry) => entry.command).reverse()
        if (!commands.length) return
        historyIndex.value = Math.min(historyIndex.value + 1, commands.length - 1)
        commandInput.value = commands[historyIndex.value] ?? ''
    }
    if (event.key === 'ArrowDown') {
        event.preventDefault()
        if (historyIndex.value <= 0) {
            historyIndex.value = -1
            commandInput.value = ''
            return
        }
        historyIndex.value -= 1
        const commands = entries.value.map((entry) => entry.command).reverse()
        commandInput.value = commands[historyIndex.value] ?? ''
    }
}

function applyHint(hint: RedisCommandHint) {
    commandInput.value = hint.example
    focusCommandInput()
}

function clearOutput() {
    entries.value = []
}

watch(
    () => [props.connectionId, props.database] as const,
    () => {
        entries.value = []
        commandInput.value = ''
    },
)

watch(
    () => props.seedCommand,
    (command) => {
        if (!command) return
        commandInput.value = command
        void runCommand(command)
    },
)

defineExpose({runCommand, focusCommandInput})
</script>

<template>
  <div class="redis-command-panel">
    <div class="redis-command-panel__toolbar">
      <div class="redis-command-panel__quick">
        <button
            v-for="command in contextQuickCommands"
            :key="command"
            class="dw-text-btn dw-text-btn--compact"
            type="button"
            :disabled="!connectionId || running"
            @click="runCommand(command)"
        >
          {{ command }}
        </button>
      </div>
    </div>

    <div class="redis-command-panel__output-wrap">
      <div class="redis-command-panel__output-head">
        <button
            class="dw-text-btn dw-text-btn--compact"
            type="button"
            :disabled="!entries.length"
            @click="clearOutput"
        >
          {{ t('explorer.redisConsole.clear') }}
        </button>
      </div>
      <pre ref="outputRef" class="redis-command-panel__output">{{ outputText || t('explorer.redisConsole.outputEmpty') }}</pre>
    </div>

    <ul v-if="commandHints.length && commandInput.trim()" class="redis-command-panel__hints">
      <li
          v-for="hint in commandHints"
          :key="hint.command"
          class="redis-command-panel__hint-item"
          @mousedown.prevent="applyHint(hint)"
      >
        <span class="redis-command-panel__hint-cmd">{{ hint.command }}</span>
        <span class="redis-command-panel__hint-example">{{ hint.example }}</span>
      </li>
    </ul>

    <form class="redis-command-panel__input-row" @submit.prevent="runCommand()">
      <span class="redis-command-panel__prompt">&gt;</span>
      <DwInput
          ref="inputRef"
          v-model="commandInput"
          class="redis-command-panel__input"
          variant="sm"
          type="text"
          :spellcheck="false"
          autocomplete="off"
          :placeholder="contextPlaceholder"
          :disabled="!connectionId || running"
          @keydown="onInputKeydown"
      />
      <DwButton
          variant="primary"
          size="sm"
          type="submit"
          :disabled="!connectionId || running || !commandInput.trim()"
      >
        {{ running ? t('explorer.redisConsole.running') : t('explorer.redisConsole.run') }}
      </DwButton>
    </form>
    <p class="redis-command-panel__hint-text">{{ activeHintText }}</p>
  </div>
</template>

<style scoped>
.redis-command-panel {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap);
  height: 100%;
  min-height: 0;
}

.redis-command-panel__toolbar {
  display: flex;
  align-items: flex-start;
  gap: var(--dw-gap);
}

.redis-command-panel__quick {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap-sm);
  min-width: 0;
}

.redis-command-panel__output-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg-editor);
  overflow: hidden;
}

.redis-command-panel__output-head {
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
  padding: var(--dw-space-2) var(--dw-space-3);
  border-bottom: 1px solid var(--dw-border);
}

.redis-command-panel__output {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: var(--dw-space-5);
  overflow: auto;
  border: 0;
  border-radius: 0;
  background: transparent;
  font-family: var(--dw-font-mono);
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading-relaxed);
  white-space: pre-wrap;
  word-break: break-word;
}

.redis-command-panel__hints {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg-panel);
  max-height: 110px;
  overflow: auto;
}

.redis-command-panel__hint-item {
  display: flex;
  gap: var(--dw-gap-md);
  padding: var(--dw-space-3) var(--dw-space-5);
  cursor: pointer;
  font-size: var(--dw-text-xs);
}

.redis-command-panel__hint-item:hover {
  background: color-mix(in srgb, var(--dw-primary) 10%, transparent);
}

.redis-command-panel__hint-cmd {
  font-family: var(--dw-font-mono);
  font-weight: 600;
}

.redis-command-panel__hint-example {
  color: var(--dw-text-muted);
  font-family: var(--dw-font-mono);
}

.redis-command-panel__input-row {
  display: flex;
  align-items: center;
  gap: var(--dw-gap);
}

.redis-command-panel__prompt {
  color: var(--dw-primary);
  font-family: var(--dw-font-mono);
  font-weight: 600;
}

.redis-command-panel__input,
:deep(.redis-command-panel__input) {
  flex: 1;
  min-width: 0;
  width: auto;
  font-family: var(--dw-font-mono);
}

.redis-command-panel__hint-text {
  margin: 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
}
</style>
