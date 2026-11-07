<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    description?: string
  }>(),
  {},
)
</script>

<template>
  <article class="dw-market-card">
    <div class="dw-market-card__head">
      <div v-if="$slots.icon" class="dw-market-card__icon">
        <slot name="icon"/>
      </div>
      <div>
        <h3 class="dw-market-card__title">
          <slot name="title">{{ title }}</slot>
        </h3>
        <p v-if="description || $slots.description" class="dw-market-card__desc">
          <slot name="description">{{ description }}</slot>
        </p>
      </div>
    </div>
    <slot/>
    <footer v-if="$slots.footer || $slots.actions" class="dw-market-card__foot">
      <slot name="footer"/>
      <div v-if="$slots.actions">
        <slot name="actions"/>
      </div>
    </footer>
  </article>
</template>
