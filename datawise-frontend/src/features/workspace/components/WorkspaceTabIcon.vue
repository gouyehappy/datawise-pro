<script setup lang="ts">
import type {WorkspaceTabType} from '@/core/types'
import {DwIcon, workspaceTabDwIcon, type DwIconName} from '@/core/icons'
import CommunityPluginIcon from '@/features/community-plugin/components/CommunityPluginIcon.vue'
import {computed} from 'vue'

const props = defineProps<{
  type: WorkspaceTabType
  pluginId?: string
}>()

const usePluginIcon = computed(() => {
  const id = props.pluginId?.trim()
  if (!id) return false
  return props.type === 'community-workbench'
    || props.type === 'community-filesystem'
    || props.type === 'connection'
})

const pluginFallback = computed<DwIconName>(() => {
  // Prefer CommunityPluginIcon / manifest.icon; do not key off pluginId strings (A-11).
  if (props.type === 'terminal') return 'terminal'
  return workspaceTabDwIcon(props.type)
})
</script>

<template>
  <span class="dw-tab__icon" aria-hidden="true">
    <CommunityPluginIcon
        v-if="usePluginIcon"
        :plugin-id="pluginId"
        :fallback="pluginFallback"
        size="tab"
    />
    <DwIcon v-else :name="workspaceTabDwIcon(type)" size="tab" :stroke-width="1.4"/>
  </span>
</template>
