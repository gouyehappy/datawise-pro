<script setup lang="ts">
/**
 * Legacy module page — community plugin center now lives as a singleton
 * workspace tab under the database workbench. Redirect immediately.
 */
import {onMounted} from 'vue'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'

onMounted(() => {
  useWorkspaceStore().openCommunityPluginCenter()
})
</script>

<template>
  <div class="community-plugin-redirect" aria-hidden="true"/>
</template>
