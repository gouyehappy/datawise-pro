<script setup lang="ts">
import {computed} from 'vue'
import {
  resolveStatusVariant,
  statusVariantClass,
  type StatusDomain,
  type StatusVariant,
} from '../utils/status-variant'

const props = withDefaults(
  defineProps<{
    variant?: StatusVariant | 'team'
    status?: string | null
    /** Optional product domain; resolvers registered via registerStatusDomain */
    domain?: StatusDomain
    chip?: boolean
    inline?: boolean
    dot?: boolean
    /** solid = filled tint; soft = lighter wash; outline = border only */
    look?: 'solid' | 'soft' | 'outline'
  }>(),
  {
    chip: false,
    inline: false,
    dot: false,
    look: 'solid',
  },
)

const resolvedVariant = computed<StatusVariant | 'team'>(() => {
  if (props.variant) return props.variant
  return resolveStatusVariant(props.status, props.domain)
})

const classList = computed(() =>
  [
    props.chip ? 'dw-status-chip' : 'dw-status',
    statusVariantClass(resolvedVariant.value === 'team' ? 'neutral' : resolvedVariant.value),
    resolvedVariant.value === 'team' ? 'dw-status--team' : '',
    props.inline ? 'dw-status--inline' : '',
    props.dot ? 'dw-status--dot' : '',
    props.look === 'soft' ? 'dw-status--look-soft' : '',
    props.look === 'outline' ? 'dw-status--look-outline' : '',
  ].filter(Boolean),
)
</script>

<template>
  <span :class="classList">
    <span v-if="dot" class="dw-status__dot" aria-hidden="true"/>
    <slot>{{ status }}</slot>
  </span>
</template>
