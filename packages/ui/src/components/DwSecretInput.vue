<script setup lang="ts">
import {computed, ref, useAttrs} from 'vue'
import {DwIcon} from '@datawise/icons'
import {useDwI18n} from '../i18n/useDwI18n'

defineOptions({inheritAttrs: false})

const model = defineModel<string>({default: ''})

const props = withDefaults(defineProps<{
  id?: string
  placeholder?: string
  disabled?: boolean
  readonly?: boolean
  autocomplete?: string
  variant?: 'default' | 'sm' | 'mono'
  showLabel?: string
  hideLabel?: string
}>(), {
  disabled: false,
  readonly: false,
  autocomplete: 'off',
  variant: 'default',
})

const attrs = useAttrs()
const t = useDwI18n()
const visible = ref(false)
const fieldEl = ref<HTMLInputElement | null>(null)

const ariaLabel = computed(() => (
  visible.value
    ? (props.hideLabel ?? t('secret.hide'))
    : (props.showLabel ?? t('secret.show'))
))

const shellClass = computed(() => [
  'dw-secret-input',
  props.variant === 'sm' && 'dw-secret-input--sm',
  props.variant === 'mono' && 'dw-secret-input--mono',
  !visible.value && 'is-masked',
  attrs.class,
])

/** Forward listeners to the real input; keep class/style on the shell. */
const fieldAttrs = computed(() => {
  const {['class']: _class, style: _style, ...rest} = attrs as Record<string, unknown>
  return rest
})

function focusField() {
  fieldEl.value?.focus()
}
</script>

<template>
  <div
    :class="shellClass"
    :style="attrs.style as string | Record<string, string> | undefined"
    @mousedown="focusField"
  >
    <input
      :id="id"
      ref="fieldEl"
      v-model="model"
      class="dw-secret-input__field"
      :type="visible ? 'text' : 'password'"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :autocomplete="autocomplete"
      spellcheck="false"
      v-bind="fieldAttrs"
      @mousedown.stop
    >
    <button
      type="button"
      class="dw-secret-input__toggle"
      tabindex="-1"
      :disabled="disabled"
      :aria-label="ariaLabel"
      @mousedown.prevent
      @click="visible = !visible"
    >
      <DwIcon
        :name="visible ? 'visibility-off' : 'visibility'"
        :size="variant === 'sm' ? 14 : 16"
        :stroke-width="1.75"
      />
    </button>
  </div>
</template>

<style scoped>
.dw-secret-input {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  width: 100%;
  height: var(--dw-input-height);
  min-height: var(--dw-input-height);
  max-height: var(--dw-input-height);
  position: relative;
  padding: 0 0 0 var(--dw-control-pad-x);
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-input-radius);
  background: var(--dw-bg-panel);
  color: var(--dw-text);
  transition: var(--dw-transition-colors), var(--dw-transition-shadow);
}

.dw-secret-input--sm {
  height: var(--dw-input-height-sm);
  min-height: var(--dw-input-height-sm);
  max-height: var(--dw-input-height-sm);
  padding-left: var(--dw-control-pad-x-sm);
  border-radius: var(--dw-input-radius);
}

.dw-secret-input:focus-within {
  outline: none;
  border-color: var(--dw-focus-border);
  box-shadow: var(--dw-focus-ring);
  background: var(--dw-bg);
}

.dw-secret-input:has(.dw-secret-input__field:disabled) {
  opacity: 0.6;
}

.dw-secret-input__field {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  margin: 0;
  padding: 0 var(--dw-input-height) 0 0;
  border: 0;
  outline: none;
  background: transparent;
  box-shadow: none;
  color: inherit;
  font: inherit;
  font-size: var(--dw-font-size-control);
  line-height: var(--dw-leading);
}

.dw-secret-input--sm .dw-secret-input__field {
  padding-right: var(--dw-input-height-sm);
}

/* CJK UI fonts draw password bullets full-width; Latin face keeps dots narrow. */
.dw-secret-input.is-masked .dw-secret-input__field {
  font-family: Verdana, Arial, sans-serif;
  letter-spacing: 0.04em;
}

.dw-secret-input--mono .dw-secret-input__field {
  font-family: var(--dw-mono);
  font-size: var(--dw-text-sm);
}

.dw-secret-input__field::placeholder {
  color: var(--dw-text-muted);
}

.dw-secret-input__toggle {
  position: absolute;
  top: 0;
  right: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  aspect-ratio: 1;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  color: var(--dw-text-muted);
  cursor: pointer;
}

.dw-secret-input__toggle:hover:not(:disabled),
.dw-secret-input__toggle:active:not(:disabled) {
  background: transparent;
  box-shadow: none;
  color: var(--dw-text);
}

.dw-secret-input__toggle:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
