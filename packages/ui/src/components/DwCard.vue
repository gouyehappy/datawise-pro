<script setup lang="ts">
import {computed, useSlots} from 'vue'

/**
 * Unified card surface — structural `.dw-card` (+ optional legacy mp-* class for host CSS).
 * `look` selects raised / outline / flat dialects.
 */
const props = withDefaults(
    defineProps<{
      variant?: 'panel' | 'feature' | 'row' | 'widget' | 'settings'
      title?: string
      description?: string
      /** 根节点标签，默认 section */
      tag?: string
      /** Surface dialect */
      look?: 'raised' | 'outline' | 'flat'
    }>(),
    {
      variant: 'panel',
      tag: 'section',
      look: 'raised',
    },
)

defineOptions({inheritAttrs: true})

const slots = useSlots()

const legacyClass = computed(() => {
  switch (props.variant) {
    case 'feature':
      return 'mp-feature-card'
    case 'row':
      return 'mp-card-row'
    case 'widget':
      return 'dash-card'
    case 'settings':
      return 'settings-card'
    case 'panel':
    default:
      return 'mp-card'
  }
})

const rootClass = computed(() => [
  'dw-card',
  legacyClass.value,
  `dw-card--${props.look}`,
  props.variant === 'row' ? 'dw-card--row' : '',
])

const hasTitle = computed(() => Boolean(props.title || slots.title))
const hasDescription = computed(() => Boolean(props.description || slots.description))
</script>

<template>
  <component :is="tag" :class="rootClass">
    <template v-if="variant === 'panel' || variant === 'feature'">
      <h2 v-if="hasTitle" class="dw-card__title mp-card__title">
        <slot name="title">{{ title }}</slot>
      </h2>
      <p v-if="hasDescription" class="dw-card__desc mp-card__desc">
        <slot name="description">{{ description }}</slot>
      </p>
      <slot/>
    </template>

    <template v-else-if="variant === 'row'">
      <div class="dw-card__main mp-card-row__main">
        <div v-if="hasTitle" class="dw-card__title mp-card-row__title">
          <slot name="title">{{ title }}</slot>
        </div>
        <p v-if="hasDescription" class="dw-card__desc mp-card-row__desc">
          <slot name="description">{{ description }}</slot>
        </p>
        <slot name="meta"/>
        <slot/>
      </div>
      <div v-if="$slots.actions">
        <slot name="actions"/>
      </div>
    </template>

    <template v-else>
      <slot name="header"/>
      <slot/>
      <slot name="actions"/>
    </template>
  </component>
</template>
