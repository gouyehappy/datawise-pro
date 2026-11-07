<script setup lang="ts">
import {computed, useSlots} from 'vue'

/**
 * Thin vertical region shell for module browse pages.
 * Order: Header → Journey? → Status? → Toolbar? → Content → Footer?
 */
const props = withDefaults(
  defineProps<{
    /** Extra root class (e.g. mp-stack-3) */
    contentClass?: string
  }>(),
  {},
)

const slots = useSlots()

const hasJourney = computed(() => Boolean(slots.journey))
const hasStatus = computed(() => Boolean(slots.status))
const hasToolbar = computed(() => Boolean(slots.toolbar))
const hasFooter = computed(() => Boolean(slots.footer))

const rootClass = computed(() => [
  'mp-regions',
  props.contentClass,
])
</script>

<template>
  <div :class="rootClass">
    <div class="mp-region mp-region--header">
      <slot name="header"/>
    </div>
    <div v-if="hasJourney" class="mp-region mp-region--journey">
      <slot name="journey"/>
    </div>
    <div v-if="hasStatus" class="mp-region mp-region--status">
      <slot name="status"/>
    </div>
    <div v-if="hasToolbar" class="mp-region mp-region--toolbar">
      <slot name="toolbar"/>
    </div>
    <div class="mp-region mp-region--content">
      <slot/>
      <slot name="content"/>
    </div>
    <div v-if="hasFooter" class="mp-region mp-region--footer">
      <slot name="footer"/>
    </div>
  </div>
</template>
