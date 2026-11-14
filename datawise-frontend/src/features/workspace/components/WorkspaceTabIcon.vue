<script setup lang="ts">
import type {WorkspaceTabType} from '@/core/types'
import {DwIcon, ensureDeferredDwIcons, workspaceTabDwIcon, type DwIconName} from '@/core/icons'
import CommunityPluginIcon from '@/features/community-plugin/components/CommunityPluginIcon.vue'
import {useThemeStore} from '@/features/settings/stores/theme-store'
import {computed, watchEffect} from 'vue'

const theme = useThemeStore()

const props = defineProps<{
  type: WorkspaceTabType
  pluginId?: string
}>()

watchEffect(() => {
  if (props.type === 'schema-compare') void ensureDeferredDwIcons()
})

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

/**
 * Functional tab tones — distinct hues so type is scannable at a glance.
 * Inline color beats skin `.dw-tab.active { color }` inheritance wars.
 */
const TAB_TONES: Partial<Record<WorkspaceTabType, string>> = {
  console: '#38bdf8',
  'elasticsearch-console': '#38bdf8',
  'mongo-console': '#4ade80',
  'redis-console': '#f87171',
  'redis-key': '#fb7185',
  'ssh-terminal': '#22d3ee',
  terminal: '#22d3ee',
  'ssh-script-record': '#2dd4bf',
  table: '#34d399',
  'schema-tables': '#34d399',
  metadoc: '#6ee7b7',
  connection: '#60a5fa',
  'create-database': '#3b82f6',
  'schema-er': '#a78bfa',
  'schema-compare': '#c084fc',
  'cross-env-compare': '#818cf8',
  'table-migration': '#f472b6',
  view_model: '#fbbf24',
  view_model_editor: '#f59e0b',
  view_model_lineage: '#eab308',
  'kafka-topics': '#fbbf24',
  'kafka-topic': '#f59e0b',
  'kafka-consumer-groups': '#d97706',
  'kafka-table-publish': '#ea580c',
  'yarn-applications': '#67e8f9',
  'yarn-nodes': '#22d3ee',
  'yarn-queues': '#06b6d4',
  'jenkins-jobs': '#f97316',
  'jenkins-nodes': '#fb923c',
  'nacos-configs': '#38bdf8',
  'nacos-services': '#0ea5e9',
  'polaris-services': '#818cf8',
  'polaris-configs': '#6366f1',
  'k8s-pods': '#22d3ee',
  'k8s-deployments': '#06b6d4',
  'k8s-services': '#0891b2',
  'k8s-events': '#fbbf24',
  'k8s-configmaps': '#a78bfa',
  'k8s-secrets': '#f472b6',
  'k8s-apply': '#34d399',
  'k8s-crds': '#c084fc',
  'k8s-helm': '#60a5fa',
  'k8s-exec': '#2dd4bf',
  platform_catalog: '#e879f9',
  data_catalog: '#d946ef',
  welcome: '#94a3b8',
  'local-text': '#38bdf8',
  'community-plugin-center': '#a78bfa',
  'community-workbench': '#818cf8',
  'community-filesystem': '#6366f1',
}

const iconToneClass = computed(() => {
  if (props.type === 'console' || props.type === 'elasticsearch-console') {
    return 'dw-tab__icon--sql'
  }
  if (props.type === 'ssh-terminal' || props.type === 'terminal') {
    return 'dw-tab__icon--terminal'
  }
  return TAB_TONES[props.type] ? 'dw-tab__icon--toned' : undefined
})

const iconToneStyle = computed(() => {
  if (!theme.coloredToolbarIcons) return undefined
  const color = TAB_TONES[props.type]
  return color ? {color} : undefined
})
</script>

<template>
  <span
      class="dw-tab__icon"
      :class="iconToneClass"
      :style="iconToneStyle"
      aria-hidden="true"
  >
    <CommunityPluginIcon
        v-if="usePluginIcon"
        :plugin-id="pluginId"
        :fallback="pluginFallback"
        size="tab"
    />
    <DwIcon
        v-else
        :name="workspaceTabDwIcon(type)"
        size="tab"
        :stroke-width="2"
        :style="iconToneStyle"
    />
  </span>
</template>
