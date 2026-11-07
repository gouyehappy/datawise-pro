<script setup lang="ts">
import {computed} from 'vue'
import {resolveStatusVariant, type StatusVariant} from '../utils/status-variant'

const props = withDefaults(
  defineProps<{
    variant?: StatusVariant
    status?: string | null
    dot?: boolean
  }>(),
  {dot: true},
)

const resolved = computed(() => props.variant ?? resolveStatusVariant(props.status))
</script>

<template>
  <span class="dw-status-badge" :class="`dw-status-badge--${resolved}`">
    <span v-if="dot" class="dw-status-badge__dot" aria-hidden="true"/>
    <slot>{{ status }}</slot>
  </span>
</template>
