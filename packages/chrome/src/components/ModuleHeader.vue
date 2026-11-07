<script setup lang="ts">
/**
 * Compact page head (`.dw-page-head`).
 * Prefer ModulePageHeader for module browse pages; keep this for denser tool headers.
 */
defineProps<{
  title: string
  subtitle?: string
  badge?: string
  hint?: string
}>()
</script>

<template>
  <header class="dw-page-head">
    <div class="dw-page-head__brand">
      <span v-if="$slots.icon" class="dw-page-head__icon">
        <slot name="icon"/>
      </span>
      <div>
        <div class="dw-page-head__title-row">
          <h1>{{ title }}</h1>
          <span v-if="badge" class="dw-badge dw-badge--soft">{{ badge }}</span>
        </div>
        <p v-if="subtitle">{{ subtitle }}</p>
      </div>
    </div>

    <div class="dw-page-head__extra">
      <slot name="extra">
        <p v-if="hint" class="dw-page-head__hint">{{ hint }}</p>
      </slot>
    </div>
  </header>
</template>
