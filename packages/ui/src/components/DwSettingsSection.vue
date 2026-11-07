<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    description?: string
  }>(),
  {},
)
</script>

<template>
  <section class="dw-settings-section">
    <header v-if="title || description || $slots.title || $slots.description" class="dw-settings-section__head">
      <h3 v-if="title || $slots.title" class="dw-settings-section__title">
        <slot name="title">{{ title }}</slot>
      </h3>
      <p v-if="description || $slots.description" class="dw-settings-section__desc">
        <slot name="description">{{ description }}</slot>
      </p>
    </header>
    <div class="dw-settings-section__body">
      <slot/>
    </div>
    <div v-if="$slots.actions" class="dw-settings-section__actions">
      <slot name="actions"/>
    </div>
  </section>
</template>
