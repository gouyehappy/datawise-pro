<script setup lang="ts">
/** Thin host wrapper — SoT `@datawise/chrome` TabAddButton. */
import {TabAddButton as PackageTabAddButton} from '@datawise/chrome'

defineProps<{
  title: string
}>()

defineEmits<{
  click: []
}>()
</script>

<template>
  <PackageTabAddButton :title="title" @click="$emit('click')"/>
</template>
