<script setup lang="ts">
withDefaults(
    defineProps<{
      title: string
      hint?: string
      /** Optional DOM id for deep-link anchors */
      id?: string
    }>(),
    {},
)
</script>

<template>
  <section :id="id" class="settings-section">
    <header class="settings-section__head">
      <h3 class="settings-section__title">{{ title }}</h3>
      <p v-if="hint" class="settings-section__hint">{{ hint }}</p>
    </header>
    <div class="settings-section__card">
      <slot/>
    </div>
  </section>
</template>
