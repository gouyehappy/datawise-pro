<script setup lang="ts">
import {computed, useSlots} from 'vue'
import DwSplitPane from './DwSplitPane.vue'

const props = withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    meta?: string
    contentClass?: string
    titleClass?: string
    bodyPadding?: 'content' | 'flush'
    recipe?: 'wb-single' | 'wb-split' | 'wb-terminal' | 'wb-canvas'
    leftClass?: string
    rightClass?: string
    splitStorageKey?: string
    splitDefaultWidth?: number
    splitDefaultRatio?: 'sidebar' | 'third' | 'half' | number
    splitMinWidth?: number
    splitMaxWidth?: number
  }>(),
  {
    bodyPadding: undefined,
    recipe: 'wb-single',
    splitDefaultWidth: 300,
    splitDefaultRatio: 'third',
    splitMinWidth: 220,
    splitMaxWidth: 960,
  },
)

const slots = useSlots()
const hasActions = computed(() => Boolean(slots.actions))
const hasToolbar = computed(() => Boolean(slots.toolbar))
const isSplit = computed(() => props.recipe === 'wb-split')

const resolvedBodyPadding = computed(() => {
  if (props.bodyPadding) return props.bodyPadding
  return isSplit.value ? 'flush' : 'content'
})

const resolvedSplitKey = computed(
  () => props.splitStorageKey || (props.contentClass ? `dw.split.wb.${props.contentClass}` : 'dw.split.wb-split'),
)

const rootClass = computed(() => [
  'dw-workbench-page',
  'dw-workbench-list-page',
  props.recipe && `dw-workbench-list-page--${props.recipe}`,
  props.contentClass,
])

const bodyClass = computed(() => [
  'dw-workbench-page__body',
  'dw-workbench-list-page__body',
  resolvedBodyPadding.value === 'flush' && 'dw-workbench-list-page__body--flush',
  isSplit.value && 'dw-workbench-split',
])

const leftColClass = computed(() =>
  ['dw-workbench-col', 'dw-workbench-col--left', props.leftClass].filter(
    (c): c is string => Boolean(c),
  ),
)

const rightColClass = computed(() =>
  ['dw-workbench-col', 'dw-workbench-col--right', props.rightClass].filter(
    (c): c is string => Boolean(c),
  ),
)
</script>

<template>
  <div :class="rootClass">
    <header class="dw-workbench-page__head">
      <div class="dw-workbench-page__title" :class="titleClass">
        <h2>{{ title }}</h2>
        <p v-if="subtitle">{{ subtitle }}</p>
        <p v-if="meta" class="dw-workbench-page__meta">{{ meta }}</p>
        <slot name="title-extra"/>
      </div>
      <div v-if="hasActions" class="dw-workbench-page__actions">
        <slot name="actions"/>
      </div>
    </header>

    <div v-if="hasToolbar" class="dw-workbench-toolbar-row">
      <slot name="toolbar"/>
    </div>

    <div :class="bodyClass">
      <DwSplitPane
        v-if="isSplit"
        class="dw-workbench-split__pane"
        :storage-key="resolvedSplitKey"
        :default-width="splitDefaultWidth"
        :default-ratio="splitDefaultRatio"
        :min-width="splitMinWidth"
        :max-width="splitMaxWidth"
        :end-min-width="320"
        :stack-below="900"
        :start-class="leftColClass"
        :end-class="rightColClass"
      >
        <template #start>
          <slot name="left"/>
        </template>
        <template #end>
          <slot name="right"/>
        </template>
      </DwSplitPane>
      <slot v-else/>
    </div>
  </div>
</template>
