<script setup lang="ts">
import type {WorkspaceTab} from '@/core/types'
import LineageGraphPanel from '@/features/workspace/components/tabs/LineageGraphPanel.vue'

defineProps<{ tab: WorkspaceTab }>()
</script>

<template>
  <LineageGraphPanel :tab="tab"/>
</template>
