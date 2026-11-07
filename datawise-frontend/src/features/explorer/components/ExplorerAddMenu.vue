<script setup lang="ts">
import {ContextMenuHost} from '@/core/context-menu'
import {useExplorerAddMenu} from '@/features/explorer/composables/useExplorerAddMenu'

defineProps<{
  x: number
  y: number
}>()

const emit = defineEmits<{
  close: []
  'create-folder': []
  'export-project-connections': []
  'import-connections': []
}>()

const {menuItems, onMenuSelect} = useExplorerAddMenu({
  onClose: () => emit('close'),
  onCreateFolder: () => emit('create-folder'),
  onExportProjectConnections: () => emit('export-project-connections'),
  onImportConnections: () => emit('import-connections'),
})
</script>

<template>
  <ContextMenuHost
      visible
      :items="menuItems"
      :x="x"
      :y="y"
      @select="onMenuSelect"
      @close="emit('close')"
  />
</template>
