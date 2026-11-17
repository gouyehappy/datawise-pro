<script setup lang="ts">
defineOptions({name: 'CommunityWorkbenchTab'})
import {computed} from 'vue'
import CommunityWorkbenchHost from '@/features/community-plugin/components/CommunityWorkbenchHost.vue'
import type {WorkspaceTab} from '@/core/types'
import type {CommunityPluginWorkbenchConnection} from '@/features/community-plugin/lib/connectCommunityPluginWorkbench'

const props = defineProps<{
  tab: WorkspaceTab
  /** False while another tab is focused — host pauses postMessage fan-in. */
  active?: boolean
}>()

const pluginId = computed(() => {
  const fromTab = props.tab.pluginId?.trim()
  if (fromTab) return fromTab
  const fromCtx = props.tab.pluginHostContext?.pluginId
  return typeof fromCtx === 'string' ? fromCtx.trim() : ''
})
const connectionId = computed(() => {
  const fromTab = props.tab.connectionId?.trim()
  if (fromTab) return fromTab
  const ctx = props.tab.pluginHostContext
  if (typeof ctx?.connectionId === 'string' && ctx.connectionId.trim()) return ctx.connectionId.trim()
  const raw = ctx?.connection
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const id = (raw as CommunityPluginWorkbenchConnection).id
    return typeof id === 'string' ? id.trim() : ''
  }
  return ''
})
const connection = computed<CommunityPluginWorkbenchConnection | undefined>(() => {
  const ctx = props.tab.pluginHostContext
  const raw = ctx?.connection
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as CommunityPluginWorkbenchConnection
  }
  return connectionId.value ? {id: connectionId.value} : undefined
})
const workbenchInstanceId = computed(() => {
  const id = props.tab.pluginHostContext?.workbenchId
  return typeof id === 'string' ? id : undefined
})
</script>

<template>
  <!--
    与 WorkspaceArea `.workspace-body__tab > :deep(*)` 衔接：单根 + min-height:0，
    把 flex 高度传给 Host/iframe。勿改 WorkspaceArea 全局规则。
  -->
  <div class="community-workbench-tab">
    <CommunityWorkbenchHost
      v-if="pluginId"
      :tab-id="tab.id"
      :plugin-id="pluginId"
      :contribution-id="tab.pluginContributionId"
      :connection-id="connectionId || undefined"
      :connection="connection"
      :workbench-instance-id="workbenchInstanceId"
      :host-context="tab.pluginHostContext"
      :active="active !== false"
    />
    <div v-else class="community-workbench-tab__missing">Missing pluginId on tab</div>
  </div>
</template>

<style scoped>
.community-workbench-tab {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--dw-bg);
}

.community-workbench-tab__missing {
  padding: 1.5rem;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
}
</style>
