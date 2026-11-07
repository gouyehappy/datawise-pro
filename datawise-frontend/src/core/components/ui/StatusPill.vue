<script setup lang="ts">
/**
 * Thin host wrapper — SoT `@datawise/ui` StatusPill.
 * Domain maps: `registerStatusDomainsHost()`.
 */
import {StatusPill as PackageStatusPill} from '@datawise/ui'
import type {StatusDomain, StatusVariant} from '@/core/utils/status-variant'

withDefaults(defineProps<{
  variant?: StatusVariant | 'team'
  status?: string | null
  domain?: StatusDomain
  chip?: boolean
  inline?: boolean
  dot?: boolean
  look?: 'solid' | 'soft' | 'outline'
}>(), {
  chip: false,
  inline: false,
  dot: false,
  look: 'solid',
})
</script>

<template>
  <PackageStatusPill
      :variant="variant"
      :status="status"
      :domain="domain"
      :chip="chip"
      :inline="inline"
      :dot="dot"
      :look="look"
  >
    <slot>{{ status }}</slot>
  </PackageStatusPill>
</template>
