<script setup lang="ts">
import {computed, useId} from 'vue'
import DwInlineAlert from './DwInlineAlert.vue'

const props = withDefaults(defineProps<{
  label: string
  inputId?: string
  error?: string
  /** Helper under the control */
  hint?: string
  /** Control group (radios): label as span + aria-labelledby */
  group?: boolean
}>(), {
  group: false,
})

const autoId = useId()
const labelId = useId()

const controlId = computed(() => props.inputId ?? (props.group ? undefined : autoId))
</script>

<template>
  <div
      class="dw-field"
      :class="{ 'dw-field--group': group }"
      :role="group ? 'group' : undefined"
      :aria-labelledby="group ? labelId : undefined"
  >
    <component
        :is="group ? 'span' : 'label'"
        :id="group ? labelId : undefined"
        :for="group ? undefined : controlId"
        class="dw-field__label"
    >
      {{ label }}
    </component>
    <slot :id="controlId" :label-id="labelId"/>
    <p v-if="hint && !error" class="dw-field__hint">{{ hint }}</p>
    <DwInlineAlert :message="error"/>
  </div>
</template>
