<script setup lang="ts">
import {computed} from 'vue'

const props = withDefaults(defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft' | 'outline' | 'link'
    size?: 'md' | 'sm'
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    loading?: boolean
    block?: boolean
}>(), {
    variant: 'primary',
    size: 'md',
    type: 'button',
    disabled: false,
    loading: false,
    block: false,
})

const emit = defineEmits<{
    click: [event: MouseEvent]
}>()

const classList = computed(() => [
    props.variant === 'primary' ? 'btn-primary' : '',
    props.variant === 'secondary' ? 'btn-secondary' : '',
    props.variant === 'ghost' ? 'btn-ghost' : '',
    props.variant === 'danger' ? 'btn-primary btn-danger' : '',
    props.variant === 'soft' ? 'btn-soft' : '',
    props.variant === 'outline' ? 'btn-outline' : '',
    props.variant === 'link' ? 'btn-link' : '',
    props.size === 'sm' ? 'btn-sm' : '',
    props.block ? 'btn-block' : '',
])

const isDisabled = computed(() => props.disabled || props.loading)

function onClick(event: MouseEvent) {
    if (isDisabled.value) return
    emit('click', event)
}
</script>

<template>
  <button
      :type="type"
      :class="classList"
      :disabled="isDisabled"
      :aria-busy="loading || undefined"
      @click="onClick"
  >
    <slot>{{ loading ? '…' : '' }}</slot>
  </button>
</template>
