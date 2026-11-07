<script setup lang="ts">
defineProps<{
    title: string
    count?: number | string
}>()
</script>

<template>
  <header class="sp-section__head">
    <h5>{{ title }}</h5>
    <span v-if="count != null" class="sp-section__badge">{{ count }}</span>
    <slot name="actions"/>
  </header>
</template>
