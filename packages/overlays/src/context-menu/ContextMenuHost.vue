<script setup lang="ts">
import {Teleport} from 'vue'
import ContextMenu from './ContextMenu.vue'
import type {ContextMenuItem} from './types'

defineProps<{
  visible: boolean
  items: ContextMenuItem[]
  x: number
  y: number
}>()

const emit = defineEmits<{
  select: [id: string]
  close: []
}>()
</script>

<template>
  <Teleport to="body">
    <ContextMenu
        v-if="visible"
        :items="items"
        :x="x"
        :y="y"
        @select="emit('select', $event)"
        @close="emit('close')"
    />
  </Teleport>
</template>
