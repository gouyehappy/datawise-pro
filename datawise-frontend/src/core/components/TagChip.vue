<script setup lang="ts">
/** Thin host wrapper — SoT `@datawise/ui` TagChip. */
import {TagChip as PackageTagChip} from '@datawise/ui'

defineProps<{
  removable?: boolean
  removeLabel?: string
}>()

const emit = defineEmits<{
  remove: []
}>()
</script>

<template>
  <PackageTagChip :removable="removable" :remove-label="removeLabel" @remove="emit('remove')">
    <template v-if="$slots.icon" #icon>
      <slot name="icon"/>
    </template>
    <slot/>
  </PackageTagChip>
</template>
