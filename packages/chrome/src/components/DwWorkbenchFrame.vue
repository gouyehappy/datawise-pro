<script setup lang="ts">
/**
 * Generic resource-browse workbench chrome (head + optional tabs + body).
 * Neutral rename of ConnectorWorkbenchFrame — no product CSS import.
 */
defineProps<{
  title: string
  badge?: string | null
}>()
</script>

<template>
  <div class="dw-workbench-frame dw-workbench-page">
    <header class="dw-workbench-frame__head">
      <div class="dw-workbench-frame__identity">
        <slot name="icon">
          <span class="dw-workbench-frame__icon-slot" aria-hidden="true"/>
        </slot>
        <span class="dw-workbench-frame__title" :title="title">{{ title }}</span>
        <span v-if="badge" class="dw-workbench-frame__badge">{{ badge }}</span>
        <slot name="identity-extra"/>
      </div>
      <div v-if="$slots.actions" class="dw-workbench-frame__actions">
        <slot name="actions"/>
      </div>
    </header>
    <div v-if="$slots.tabs" class="dw-workbench-frame__tabs" role="tablist">
      <slot name="tabs"/>
    </div>
    <div class="dw-workbench-frame__body">
      <slot/>
    </div>
  </div>
</template>
