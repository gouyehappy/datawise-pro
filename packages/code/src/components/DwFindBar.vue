<script setup lang="ts">
import {nextTick, ref, watch} from 'vue'
import {DwIcon} from '@datawise/icons'
import {useCodeI18n} from '../code-i18n'

const props = withDefaults(
  defineProps<{
    open: boolean
    modelValue: string
    /** 1-based active match index; `0` when idle / no match. */
    resultIndex?: number
    resultCount?: number
    matchState?: 'idle' | 'match' | 'no-match'
    placeholder?: string
    ariaLabel?: string
    dark?: boolean
  }>(),
  {
    resultIndex: 0,
    resultCount: 0,
    matchState: 'idle',
    dark: true,
  },
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:modelValue': [value: string]
  'find-next': []
  'find-previous': []
  close: []
}>()

const t = useCodeI18n()
const inputRef = ref<HTMLInputElement | null>(null)

const resolvedPlaceholder = () => props.placeholder ?? t('common.findBar.placeholder')
const resolvedAriaLabel = () => props.ariaLabel ?? t('common.findBar.ariaLabel')

const statusText = () => {
  if (props.matchState === 'no-match' && props.modelValue.trim()) {
    return t('common.findBar.noMatch')
  }
  if (props.matchState === 'match' && props.resultCount > 0) {
    return t('common.findBar.matchIndex', {
      index: props.resultIndex,
      count: props.resultCount,
    })
  }
  return ''
}

function close() {
  emit('update:open', false)
  emit('close')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    if (event.shiftKey) emit('find-previous')
    else emit('find-next')
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    close()
  }
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    await nextTick()
    inputRef.value?.focus()
    inputRef.value?.select()
  },
)
</script>

<template>
  <div
      v-if="open"
      class="dw-find-bar"
      :class="{ 'dw-find-bar--dark': dark, 'is-no-match': matchState === 'no-match' && modelValue.trim() }"
      role="search"
      :aria-label="resolvedAriaLabel()"
      @keydown="onKeydown"
      @mousedown.stop
  >
    <input
        ref="inputRef"
        class="dw-find-bar__input"
        type="search"
        spellcheck="false"
        :value="modelValue"
        :placeholder="resolvedPlaceholder()"
        :aria-label="resolvedAriaLabel()"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    >
    <span
        v-if="statusText()"
        class="dw-find-bar__status"
        :data-state="matchState"
        role="status"
    >{{ statusText() }}</span>
    <span class="dw-step-nav dw-find-bar__step">
      <button
          type="button"
          class="dw-step-nav__btn"
          :title="t('common.findBar.prev')"
          :aria-label="t('common.findBar.prev')"
          :disabled="matchState !== 'match'"
          @click="emit('find-previous')"
      >
        <DwIcon name="chevron-left" size="sm" :stroke-width="2.25"/>
      </button>
      <button
          type="button"
          class="dw-step-nav__btn dw-step-nav__btn--last"
          :title="t('common.findBar.next')"
          :aria-label="t('common.findBar.next')"
          :disabled="matchState !== 'match'"
          @click="emit('find-next')"
      >
        <DwIcon name="chevron-right" size="sm" :stroke-width="2.25"/>
      </button>
    </span>
    <button
        type="button"
        class="dw-find-bar__btn"
        :title="t('common.findBar.close')"
        :aria-label="t('common.findBar.close')"
        @click="close"
    >
      <DwIcon name="x" size="sm" :stroke-width="2.25"/>
    </button>
  </div>
</template>

<style scoped>
.dw-find-bar {
  position: absolute;
  top: 8px;
  right: 12px;
  z-index: 7;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: calc(100% - 24px);
  padding: 5px 6px;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius, 6px);
  background: var(--dw-bg-panel, var(--dw-bg));
  box-shadow: var(--dw-shadow-popover, 0 8px 24px rgba(0, 0, 0, 0.18));
}

.dw-find-bar--dark {
  border-color: var(--dw-terminal-border, var(--dw-border));
  background: color-mix(in srgb, var(--dw-terminal-bg, var(--dw-bg-panel)) 92%, var(--dw-bg));
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}

.dw-find-bar__input {
  width: 180px;
  min-width: 120px;
  max-width: 36vw;
  height: var(--dw-density-xs);
  padding: 0 var(--dw-space-2);
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius-sm);
  outline: none;
  background: var(--dw-bg);
  color: var(--dw-text);
  font-size: var(--dw-text-sm);
}

.dw-find-bar--dark .dw-find-bar__input {
  border-color: var(--dw-terminal-border, var(--dw-border));
  background: var(--dw-terminal-input-bg, var(--dw-bg));
  color: var(--dw-terminal-fg, var(--dw-text));
}

.dw-find-bar__input:focus {
  border-color: var(--dw-primary-border, var(--dw-primary));
  box-shadow: 0 0 0 2px var(--dw-primary-ring, color-mix(in srgb, var(--dw-primary) 25%, transparent));
}

.dw-find-bar.is-no-match .dw-find-bar__input {
  border-color: color-mix(in srgb, var(--dw-danger, #ef4444) 55%, var(--dw-border));
}

.dw-find-bar__status {
  min-width: 3.5rem;
  max-width: 7rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 4px;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-variant-numeric: tabular-nums;
}

.dw-find-bar__status[data-state='no-match'] {
  color: var(--dw-danger, #ef4444);
}

.dw-find-bar__step {
  flex: 0 0 auto;
}

.dw-find-bar__step .dw-step-nav__btn {
  width: var(--dw-icon-btn-size-sm);
  min-width: var(--dw-icon-btn-size-sm);
  height: var(--dw-icon-btn-size-sm);
}

.dw-find-bar__btn {
  display: inline-grid;
  place-items: center;
  width: var(--dw-icon-btn-size-sm);
  height: var(--dw-icon-btn-size-sm);
  flex: 0 0 var(--dw-icon-btn-size-sm);
  padding: 0;
  border: 0;
  border-radius: var(--dw-control-radius-sm);
  background: transparent;
  color: var(--dw-text-secondary);
  cursor: pointer;
}

.dw-find-bar__btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--dw-primary) 12%, transparent);
  color: var(--dw-primary);
}

.dw-find-bar--dark .dw-find-bar__btn:hover:not(:disabled) {
  color: var(--dw-primary);
}

.dw-find-bar__btn:disabled {
  color: var(--dw-text-muted);
  opacity: var(--dw-control-disabled-opacity);
  cursor: default;
}
</style>
