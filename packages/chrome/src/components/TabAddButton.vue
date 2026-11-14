<script setup lang="ts">
import {DwIcon} from '@datawise/icons'

defineProps<{
  title: string
}>()

const emit = defineEmits<{
  click: []
}>()
</script>

<template>
  <button class="dw-tab-add" :title="title" type="button" @click="emit('click')">
    <DwIcon name="plus" :size="16" :stroke-width="2.25"/>
  </button>
</template>
