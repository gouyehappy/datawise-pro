<script setup lang="ts">
import type {WorkspaceTab} from '@/core/types'
import SchemaErGraphPanel from '@/features/workspace/components/tabs/SchemaErGraphPanel.vue'

defineProps<{ tab: WorkspaceTab }>()
</script>

<template>
  <SchemaErGraphPanel :tab="tab"/>
</template>
