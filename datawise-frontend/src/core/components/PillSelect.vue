<script setup lang="ts">
/** Thin host wrapper — SoT `@datawise/ui` PillSelect. */
import {PillSelect as PackagePillSelect} from '@datawise/ui'

const model = defineModel<string>({required: true})

withDefaults(
  defineProps<{
    options: string[]
    size?: 'default' | 'compact'
    menuMinWidth?: string
  }>(),
  {size: 'default'},
)
</script>

<template>
  <PackagePillSelect
      v-model="model"
      :options="options"
      :size="size"
      :menu-min-width="menuMinWidth"
  />
</template>
