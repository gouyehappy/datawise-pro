<script setup lang="ts">
import {computed, useSlots} from 'vue'

/**
 * Shared module browse-page header.
 * Visuals use module-page `.mp-hero*` classes from chrome styles.
 */
const props = withDefaults(
  defineProps<{
    /** hero: product title; compact: denser same-family layout */
    variant?: 'hero' | 'compact'
    title: string
    subtitle?: string
    eyebrow?: string
    hint?: string
    /** Extra class on the header root (e.g. plugin-hero) */
    contentClass?: string
  }>(),
  {
    variant: 'hero',
  },
)

const slots = useSlots()

const hasSettings = computed(() => Boolean(slots.settings))
const hasActions = computed(() => Boolean(slots.actions))
const hasAside = computed(() => Boolean(slots.aside))

const headerClass = computed(() => [
  'mp-hero',
  props.variant === 'compact' && 'mp-hero--compact',
  hasSettings.value && 'mp-hero--with-settings',
  props.contentClass,
])
</script>

<template>
  <header :class="headerClass">
    <div v-if="hasSettings" class="mp-hero__settings">
      <slot name="settings"/>
    </div>
    <div class="mp-hero__inner">
      <div class="mp-hero__copy">
        <p v-if="eyebrow" class="mp-hero__eyebrow">{{ eyebrow }}</p>
        <h1 class="mp-hero__title">{{ title }}</h1>
        <p v-if="subtitle" class="mp-hero__sub">{{ subtitle }}</p>
        <p v-if="hint" class="mp-hero__hint">{{ hint }}</p>
        <slot name="copy-extra"/>
      </div>
      <div v-if="hasActions" class="mp-hero__actions">
        <slot name="actions"/>
      </div>
      <div v-if="hasAside" class="mp-hero__aside">
        <slot name="aside"/>
      </div>
    </div>
    <!-- Hidden inputs / refs stay inside header -->
    <slot/>
  </header>
</template>
