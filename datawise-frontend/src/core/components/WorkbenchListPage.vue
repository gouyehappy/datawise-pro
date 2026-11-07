<script setup lang="ts">
/** Thin host wrapper — SoT `@datawise/chrome` WorkbenchListPage. */
import {WorkbenchListPage as PackageWorkbenchListPage} from '@datawise/chrome'

withDefaults(
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
    recipe: 'wb-single',
    splitDefaultWidth: 300,
    splitDefaultRatio: 'third',
    splitMinWidth: 220,
    splitMaxWidth: 960,
  },
)
</script>

<template>
  <PackageWorkbenchListPage
      :title="title"
      :subtitle="subtitle"
      :meta="meta"
      :content-class="contentClass"
      :title-class="titleClass"
      :body-padding="bodyPadding"
      :recipe="recipe"
      :left-class="leftClass"
      :right-class="rightClass"
      :split-storage-key="splitStorageKey"
      :split-default-width="splitDefaultWidth"
      :split-default-ratio="splitDefaultRatio"
      :split-min-width="splitMinWidth"
      :split-max-width="splitMaxWidth"
  >
    <template v-if="$slots['title-extra']" #title-extra>
      <slot name="title-extra"/>
    </template>
    <template v-if="$slots.actions" #actions>
      <slot name="actions"/>
    </template>
    <template v-if="$slots.toolbar" #toolbar>
      <slot name="toolbar"/>
    </template>
    <template v-if="$slots.left" #left>
      <slot name="left"/>
    </template>
    <template v-if="$slots.right" #right>
      <slot name="right"/>
    </template>
    <slot/>
  </PackageWorkbenchListPage>
</template>
