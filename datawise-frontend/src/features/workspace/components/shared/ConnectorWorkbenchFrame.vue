<script setup lang="ts">
/**
 * Nacos/DBX-style compact workbench chrome: single-line head + flush body.
 */
import '@/features/workspace/components/shared/connector-workbench.css'

defineProps<{
  endpoint: string
  badge?: string | null
  icon?: string
}>()
</script>

<template>
  <div class="connector-workbench dw-workbench-page">
    <header class="connector-workbench__head">
      <div class="connector-workbench__identity">
        <slot name="icon">
          <span class="connector-workbench__icon-slot" aria-hidden="true"/>
        </slot>
        <span class="connector-workbench__endpoint" :title="endpoint">{{ endpoint }}</span>
        <span v-if="badge" class="connector-workbench__badge">{{ badge }}</span>
        <slot name="identity-extra"/>
      </div>
      <div v-if="$slots.actions" class="connector-workbench__actions">
        <slot name="actions"/>
      </div>
    </header>
    <div v-if="$slots.tabs" class="connector-workbench__tabs" role="tablist">
      <slot name="tabs"/>
    </div>
    <div class="connector-workbench__body">
      <slot/>
    </div>
  </div>
</template>
