<script setup lang="ts">
import {computed, nextTick, ref, watch} from 'vue'
import {useSqlEditorI18n} from '@sql-editor/composables/useSqlEditorI18n'
import {
  SQL_EDITOR_AI_ACTIONS,
  aiActionAllowsEmptyPrompt,
  type SqlEditorAiAction,
} from '@sql-editor/ai/actions'

const props = withDefaults(
    defineProps<{
      generating?: boolean
      error?: string
      success?: boolean
      dialectLabel?: string
      shortcutLabel?: string
      hasSelection?: boolean
      hasSql?: boolean
    }>(),
    {
      generating: false,
      success: false,
      hasSelection: false,
      hasSql: false,
    },
)

const emit = defineEmits<{
  submit: [action: SqlEditorAiAction, prompt: string]
  cancel: []
  dismissError: []
  close: []
}>()

const {t} = useSqlEditorI18n()
const prompt = ref('')
const action = ref<SqlEditorAiAction>('generate')
const inputRef = ref<HTMLInputElement>()

const actionLabelKey: Record<SqlEditorAiAction, string> = {
  generate: 'hintbar.ai_action_generate',
  explain: 'hintbar.ai_action_explain',
  optimize: 'hintbar.ai_action_optimize',
  fix: 'hintbar.ai_action_fix',
  mock: 'hintbar.ai_action_mock',
}

const placeholderKey: Record<SqlEditorAiAction, string> = {
  generate: 'hintbar.ai_prompt_placeholder_short',
  explain: 'hintbar.ai_prompt_explain',
  optimize: 'hintbar.ai_prompt_optimize',
  fix: 'hintbar.ai_prompt_fix',
  mock: 'hintbar.ai_prompt_mock',
}

const placeholder = computed(() => {
  if (props.generating) return t('hintbar.ai_status_generating')
  return t(placeholderKey[action.value])
})

const canSubmit = computed(() => {
  if (props.generating) return false
  const text = prompt.value.trim()
  if (text) return true
  if (!aiActionAllowsEmptyPrompt(action.value)) return false
  return props.hasSelection || props.hasSql
})

function focusInput() {
  void nextTick(() => inputRef.value?.focus())
}

function submit() {
  if (!canSubmit.value) return
  emit('submit', action.value, prompt.value.trim())
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    submit()
  }
  if (event.key === 'Escape') {
    if (props.generating) {
      emit('cancel')
      return
    }
    if (prompt.value) {
      prompt.value = ''
      return
    }
    emit('close')
  }
}

watch(
    () => props.generating,
    (now, was) => {
      if (was && !now && !props.error) {
        prompt.value = ''
      }
    },
)

function prepare(nextAction: SqlEditorAiAction, nextPrompt = '') {
  action.value = nextAction
  prompt.value = nextPrompt
  focusInput()
}

defineExpose({focus: focusInput, prepare})
</script>

<template>
  <div
      class="sql-editor-ai-bar"
      :class="{
      'is-generating': generating,
      'is-success': success && !generating && !error,
      'has-error': !!error,
    }"
      role="region"
      :aria-label="t('hintbar.ai_region')"
  >
    <div class="ai-row" :class="{ 'is-sending': generating }">
      <span class="ai-badge" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="10" height="10">
          <path
              fill="currentColor"
              d="M8 1.2a.75.75 0 0 1 .68.43l1.12 2.27 2.51.37a.75.75 0 0 1 .42 1.28l-1.82 1.77.43 2.5a.75.75 0 0 1-1.09.79L8 9.35l-2.25 1.18a.75.75 0 0 1-1.09-.79l.43-2.5L3.27 5.65a.75.75 0 0 1 .42-1.28l2.51-.37L7.32 1.63A.75.75 0 0 1 8 1.2z"
          />
        </svg>
      </span>

      <select
          v-model="action"
          class="ai-mode"
          :disabled="generating"
          :aria-label="t('hintbar.ai_region')"
      >
        <option v-for="item in SQL_EDITOR_AI_ACTIONS" :key="item" :value="item">
          {{ t(actionLabelKey[item]) }}
        </option>
      </select>

      <input
          ref="inputRef"
          v-model="prompt"
          class="ai-input"
          type="text"
          :placeholder="placeholder"
          :disabled="generating"
          :aria-busy="generating"
          spellcheck="false"
          @keydown="onKeydown"
      />

      <span v-if="generating" class="ai-chip ai-chip-busy" aria-live="polite">
        <span class="ai-spinner" aria-hidden="true"/>
        <span class="ai-chip-text">{{ t('hintbar.ai_status_generating') }}</span>
      </span>

      <span v-else-if="success && !error" class="ai-chip ai-chip-ok" aria-live="polite">
        {{ t('hintbar.ai_status_success') }}
      </span>

      <span v-else-if="dialectLabel" class="ai-chip ai-chip-muted">{{ dialectLabel }}</span>

      <button
          v-if="generating"
          type="button"
          class="ai-icon-btn ai-icon-btn-ghost"
          :title="t('hintbar.ai_cancel')"
          @click="emit('cancel')"
      >
        <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
          <path d="M4 4l8 8M12 4 4 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>

      <button
          v-else
          type="button"
          class="ai-icon-btn ai-icon-btn-send"
          :title="t('hintbar.ai_generate')"
          :disabled="!canSubmit"
          @click="submit"
      >
        <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
          <path d="M2.2 8.1 13.8 2.8 9.1 8.1 13.8 13.4 2.2 8.1Z" fill="currentColor"/>
        </svg>
      </button>

      <button
          type="button"
          class="ai-icon-btn ai-icon-btn-ghost"
          :title="t('hintbar.ai_close', { keys: shortcutLabel ?? 'Ctrl+Shift+I' })"
          :disabled="generating"
          @click="emit('close')"
      >
        <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
          <path d="M4 4l8 8M12 4 4 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <p v-if="error" class="ai-error">
      <span>{{ error }}</span>
      <button type="button" class="ai-error-dismiss" @click="emit('dismissError')">
        {{ t('hintbar.ai_dismiss_error') }}
      </button>
    </p>
  </div>
</template>

<style scoped>
.sql-editor-ai-bar {
  flex-shrink: 0;
  padding: 3px 10px 4px;
  border-bottom: 1px solid var(--dw-border-light, rgba(0, 0, 0, 0.06));
  background: color-mix(in srgb, #7c3aed 3%, var(--dw-bg-subtle, #f8f9fb));
  animation: ai-bar-in 0.16s ease-out;
}

@keyframes ai-bar-in {
  from {
    opacity: 0;
    transform: translateY(-3px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.sql-editor-ai-bar.is-generating {
  background: color-mix(in srgb, #7c3aed 6%, var(--dw-bg-subtle, #f8f9fb));
}

.ai-row {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 6px 0 4px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, #7c3aed 16%, var(--dw-border-light, rgba(0, 0, 0, 0.08)));
  background: var(--dw-bg-elevated, #fff);
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.03);
}

.ai-row.is-sending {
  border-color: color-mix(in srgb, #7c3aed 38%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, #7c3aed 10%, transparent);
  animation: ai-row-pulse 1.2s ease-in-out infinite;
}

@keyframes ai-row-pulse {
  0%, 100% {
    border-color: color-mix(in srgb, #7c3aed 28%, transparent);
  }
  50% {
    border-color: color-mix(in srgb, #7c3aed 48%, transparent);
  }
}

.ai-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  color: #7c3aed;
  background: color-mix(in srgb, #7c3aed 10%, transparent);
}

.ai-mode {
  flex: 0 0 auto;
  max-width: 72px;
  height: 20px;
  padding: 0 4px;
  border: none;
  border-radius: 4px;
  background: color-mix(in srgb, #7c3aed 6%, transparent);
  color: #6d28d9;
  font-size: 10px;
  font-weight: 600;
  line-height: 20px;
  cursor: pointer;
  outline: none;
}

.ai-mode:disabled {
  opacity: 0.65;
  cursor: wait;
}

.ai-input {
  flex: 1 1 auto;
  min-width: 0;
  height: 22px;
  padding: 0 2px;
  border: none;
  background: transparent;
  font-size: 11px;
  line-height: 22px;
  color: var(--dw-text-primary, #1f2937);
  outline: none;
}

.ai-input::placeholder {
  color: var(--dw-text-muted, #9ca3af);
}

.ai-input:disabled {
  opacity: 0.8;
  cursor: wait;
}

.ai-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  max-width: 42%;
  padding: 0 5px;
  border-radius: 4px;
  font-size: 10px;
  line-height: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ai-chip-muted {
  color: var(--dw-text-muted, #6b7280);
  background: var(--dw-bg-muted, rgba(0, 0, 0, 0.04));
  font-weight: 600;
  letter-spacing: 0.02em;
}

.ai-chip-busy {
  color: #7c3aed;
  font-weight: 600;
  background: color-mix(in srgb, #7c3aed 8%, transparent);
}

.ai-chip-ok {
  color: #16a34a;
  font-weight: 600;
  background: color-mix(in srgb, #16a34a 8%, transparent);
}

.ai-chip-text {
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 720px) {
  .ai-chip-text {
    display: none;
  }

  .ai-mode {
    max-width: 56px;
  }
}

.ai-spinner {
  width: 10px;
  height: 10px;
  border: 1.5px solid color-mix(in srgb, #7c3aed 22%, transparent);
  border-top-color: #7c3aed;
  border-radius: 50%;
  animation: ai-spin 0.65s linear infinite;
}

@keyframes ai-spin {
  to {
    transform: rotate(360deg);
  }
}

.ai-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.12s, opacity 0.12s;
}

.ai-icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ai-icon-btn-send {
  color: #fff;
  background: linear-gradient(180deg, #8b5cf6, #7c3aed);
}

.ai-icon-btn-send:hover:not(:disabled) {
  filter: brightness(1.05);
}

.ai-icon-btn-ghost {
  color: var(--dw-text-muted, #888);
  background: transparent;
}

.ai-icon-btn-ghost:hover:not(:disabled) {
  color: var(--dw-text-secondary, #555);
  background: var(--dw-bg-muted, rgba(0, 0, 0, 0.05));
}

.ai-error {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin: 4px 2px 0;
  font-size: 10px;
  line-height: 1.35;
  color: #b91c1c;
}

.ai-error-dismiss {
  flex-shrink: 0;
  padding: 0;
  border: none;
  background: none;
  font-size: 10px;
  font-weight: 600;
  color: inherit;
  cursor: pointer;
  text-decoration: underline;
}
</style>
