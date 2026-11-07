<script setup lang="ts">
import {computed, useAttrs} from 'vue'
import {DwIcon, type DwIconName} from '@datawise/icons'
import DwInput from './DwInput.vue'

defineOptions({inheritAttrs: false})

const model = defineModel<string | number>()

const props = withDefaults(defineProps<{
  id?: string
  type?: 'text' | 'search' | 'number' | 'password' | 'email' | 'url'
  placeholder?: string
  disabled?: boolean
  readonly?: boolean
  autocomplete?: string
  min?: number | string
  max?: number | string
  step?: number | string
  variant?: 'default' | 'sm' | 'mono'
  /** 右侧操作按钮无障碍文案 */
  actionLabel: string
  /** 右侧图标，默认 refresh */
  actionIcon?: DwIconName
  /** 仅禁用操作按钮（输入仍可编辑） */
  actionDisabled?: boolean
  actionLoading?: boolean
}>(), {
  type: 'text',
  disabled: false,
  readonly: false,
  variant: 'default',
  actionIcon: 'refresh',
  actionDisabled: false,
  actionLoading: false,
})

const emit = defineEmits<{
  action: []
}>()

const attrs = useAttrs()

const rootClass = computed(() => attrs.class)
const inputAttrs = computed(() => {
  const {[ 'class' ]: _class, ...rest} = attrs as Record<string, unknown>
  return rest
})

const actionBusy = computed(() => props.actionDisabled || props.actionLoading || props.disabled)
</script>

<template>
  <div
      class="dw-input-action"
      :class="[
        rootClass,
        {
          'dw-input-action--sm': variant === 'sm',
          'is-loading': actionLoading,
        },
      ]"
  >
    <DwInput
        :id="id"
        v-model="model"
        :variant="variant"
        :type="type"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="readonly"
        :autocomplete="autocomplete"
        :min="min"
        :max="max"
        :step="step"
        v-bind="inputAttrs"
    />
    <button
        type="button"
        class="dw-input-action__btn"
        tabindex="-1"
        :disabled="actionBusy"
        :aria-label="actionLabel"
        :title="actionLabel"
        :aria-busy="actionLoading || undefined"
        @click="emit('action')"
    >
      <DwIcon :name="actionIcon" size="sm" :stroke-width="1.75"/>
    </button>
  </div>
</template>

<style scoped>
.dw-input-action {
  position: relative;
  display: inline-block;
  width: auto;
  max-width: 100%;
  min-width: 0;
  vertical-align: middle;
}

.dw-input-action :deep(.dw-input) {
  width: 100%;
  padding-right: 36px;
}

.dw-input-action__btn {
  position: absolute;
  top: 50%;
  right: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: calc(var(--dw-control-h) - 8px);
  border: none;
  border-radius: var(--dw-control-radius-sm);
  background: transparent;
  color: var(--dw-text-muted);
  transform: translateY(-50%);
  transition: background var(--dw-duration-fast) var(--dw-ease),
    color var(--dw-duration-fast) var(--dw-ease);
  cursor: pointer;
}

.dw-input-action--sm :deep(.dw-input) {
  padding-right: 32px;
}

.dw-input-action--sm .dw-input-action__btn {
  width: 22px;
  height: calc(var(--dw-control-h-sm) - 6px);
  right: 5px;
}

.dw-input-action__btn:hover:not(:disabled) {
  background: var(--dw-bg-hover);
  color: var(--dw-text-secondary);
}

.dw-input-action__btn:focus-visible {
  outline: none;
  box-shadow: var(--dw-focus-ring);
}

.dw-input-action__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.dw-input-action.is-loading .dw-input-action__btn :deep(.dw-icon-root) {
  animation: dw-input-action-spin 0.8s linear infinite;
}

.dw-input-action__btn :deep(.dw-icon-root) {
  width: var(--dw-icon-size-sm);
  height: var(--dw-icon-size-sm);
}

@keyframes dw-input-action-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
