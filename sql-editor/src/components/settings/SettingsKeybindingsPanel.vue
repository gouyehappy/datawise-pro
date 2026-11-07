<script setup lang="ts">
import {useSqlEditorI18n} from '@sql-editor/composables/useSqlEditorI18n'
import type {SqlKeybindingConfig} from '@sql-editor/types'

const props = defineProps<{
  keybindings: readonly SqlKeybindingConfig[]
  keybindingError: string
  isKeybindingEnabled: (binding: SqlKeybindingConfig) => boolean
  isRecordingBinding: (binding: SqlKeybindingConfig) => boolean
  keyDisplay: (binding: SqlKeybindingConfig) => string
}>()

const emit = defineEmits<{
  toggleEnabled: [binding: SqlKeybindingConfig, enabled: boolean]
  startRecording: [binding: SqlKeybindingConfig]
}>()

const {t} = useSqlEditorI18n()

function bindingLabel(binding: SqlKeybindingConfig): string {
  const key = (binding.labelKey ?? `shortcut.${binding.id}`) as Parameters<typeof t>[0]
  const translated = t(key)
  return translated !== key ? translated : binding.id
}
</script>

<template>
  <section class="panel-section">
    <p class="section-hint">{{ t('settings.keybindings_hint') }}</p>
    <p v-if="keybindingError" class="section-error">{{ keybindingError }}</p>
    <div class="bind-list">
      <div
          v-for="binding in keybindings"
          :key="`${binding.id}:${binding.keys}`"
          class="bind-row"
          :class="{ off: !isKeybindingEnabled(binding) }"
      >
        <button
            type="button"
            class="bind-toggle"
            :title="t('settings.enabled')"
            :aria-pressed="isKeybindingEnabled(binding)"
            @click="emit('toggleEnabled', binding, !isKeybindingEnabled(binding))"
        />
        <div class="bind-copy">
          <span class="bind-label">{{ bindingLabel(binding) }}</span>
          <span class="bind-id mono">{{ binding.id }}</span>
        </div>
        <button
            type="button"
            class="bind-keys mono"
            :class="{ recording: isRecordingBinding(binding) }"
            :title="t('settings.keybinding_record')"
            :disabled="!isKeybindingEnabled(binding)"
            @click="emit('startRecording', binding)"
        >{{ keyDisplay(binding) }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.panel-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section-hint {
  margin: 0 0 2px;
  font-size: 10px;
  line-height: 1.45;
  color: var(--se-text-muted);
}

.section-error {
  margin: 0;
  font-size: 10px;
  color: color-mix(in srgb, var(--se-danger) 82%, var(--se-text));
}

.bind-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bind-row {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr) 92px;
  align-items: center;
  gap: 6px;
  padding: 5px 6px;
  border-radius: 6px;
  border: 1px solid var(--se-border);
  background: color-mix(in srgb, var(--se-bg-muted) 35%, var(--se-bg));
}

.bind-copy {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.bind-label {
  font-size: 10px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bind-id {
  font-size: 8px;
  color: var(--se-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bind-keys {
  width: 92px;
  min-height: 22px;
  padding: 3px 5px;
  border: 1px solid var(--se-border);
  border-radius: 4px;
  font-size: 9px;
  color: var(--se-text);
  background: var(--se-bg-muted);
  cursor: pointer;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bind-keys.recording {
  color: var(--se-accent);
  border-color: color-mix(in srgb, var(--se-accent) 45%, transparent);
  background: color-mix(in srgb, var(--se-accent) 10%, var(--se-bg));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--se-accent) 16%, transparent);
  animation: bind-pulse 1.2s ease-in-out infinite;
}

@keyframes bind-pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.72;
  }
}

.bind-keys:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.bind-keys:not(:disabled):hover {
  border-color: color-mix(in srgb, var(--se-accent) 30%, transparent);
}

.bind-row.off {
  opacity: 0.55;
}

.bind-toggle {
  width: 10px;
  height: 10px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid var(--se-border);
  background: var(--se-bg-muted);
  cursor: pointer;
}

.bind-row:not(.off) .bind-toggle {
  background: var(--se-accent);
  border-color: color-mix(in srgb, var(--se-accent) 60%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--se-accent) 18%, transparent);
}

.mono {
  font-family: var(--dw-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}
</style>
