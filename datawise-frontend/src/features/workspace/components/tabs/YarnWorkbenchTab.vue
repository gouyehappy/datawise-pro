<script setup lang="ts">
defineOptions({name: 'YarnWorkbenchTab'})

import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'
import type {WorkspaceTab} from '@/core/types'
import {formatHttpEndpoint} from '@/features/connection'
import ConnectorWorkbenchFrame from '@/features/workspace/components/shared/ConnectorWorkbenchFrame.vue'
import YarnApplicationsPanel from '@/features/workspace/components/yarn/YarnApplicationsPanel.vue'
import YarnNodesPanel from '@/features/workspace/components/yarn/YarnNodesPanel.vue'
import YarnQueuesPanel from '@/features/workspace/components/yarn/YarnQueuesPanel.vue'
import {
    connectorEndpointFromConfig,
    useConnectorWorkbenchHeader,
} from '@/features/workspace/composables/useConnectorWorkbenchHeader'
import {getTabParam, setTabParam} from '@/features/workspace/services/workspace-tab-params'

const props = defineProps<{ tab: WorkspaceTab }>()

const {t} = useI18n()
const appsRef = ref<InstanceType<typeof YarnApplicationsPanel> | null>(null)
const nodesRef = ref<InstanceType<typeof YarnNodesPanel> | null>(null)
const queuesRef = ref<InstanceType<typeof YarnQueuesPanel> | null>(null)

const {
    connectionId,
    displayEndpoint,
    canOpenConsole,
    openConsole,
} = useConnectorWorkbenchHeader({
    connectionId: () => props.tab.connectionId ?? '',
    noConnectionLabel: () => t('explorer.yarnApps.noConnection'),
    formatEndpoint: (config, fallback) =>
        connectorEndpointFromConfig(config, fallback, (cfg) =>
            formatHttpEndpoint('yarn', cfg.host, cfg.port, cfg.advancedConfig),
        ),
})

const activeView = computed({
  get: (): 'applications' | 'nodes' | 'queues' => {
    const view = getTabParam(props.tab, 'yarnView')
    if (view === 'applications' || view === 'nodes' || view === 'queues') return view
    if (props.tab.type === 'yarn-nodes') return 'nodes'
    if (props.tab.type === 'yarn-queues') return 'queues'
    return 'applications'
  },
  set: (value: 'applications' | 'nodes' | 'queues') => {
    setTabParam(props.tab, 'yarnView', value)
  },
})

function refresh() {
  if (activeView.value === 'nodes') nodesRef.value?.refresh()
  else if (activeView.value === 'queues') queuesRef.value?.refresh()
  else appsRef.value?.refresh()
}
</script>

<template>
  <ConnectorWorkbenchFrame
      class="yarn-workbench"
      :endpoint="displayEndpoint"
  >
    <template #icon>
      <DwIcon name="tab-yarn" size="sm"/>
    </template>
    <template #actions>
      <button
          type="button"
          class="dw-text-btn"
          :disabled="!canOpenConsole"
          @click="openConsole"
      >
        {{ t('explorer.yarnWorkbench.openConsole') }}
      </button>
      <button type="button" class="dw-text-btn" @click="refresh">
        {{ t('explorer.yarnApps.refresh') }}
      </button>
    </template>
    <template #tabs>
      <button
          type="button"
          role="tab"
          :aria-selected="activeView === 'applications'"
          :class="{ 'is-active': activeView === 'applications' }"
          @click="activeView = 'applications'"
      >
        {{ t('explorer.yarnWorkbench.applications') }}
      </button>
      <button
          type="button"
          role="tab"
          :aria-selected="activeView === 'nodes'"
          :class="{ 'is-active': activeView === 'nodes' }"
          @click="activeView = 'nodes'"
      >
        {{ t('explorer.yarnWorkbench.nodes') }}
      </button>
      <button
          type="button"
          role="tab"
          :aria-selected="activeView === 'queues'"
          :class="{ 'is-active': activeView === 'queues' }"
          @click="activeView = 'queues'"
      >
        {{ t('explorer.yarnWorkbench.queues') }}
      </button>
    </template>

    <div v-show="activeView === 'applications'" class="connector-workbench__panel">
      <YarnApplicationsPanel
          ref="appsRef"
          :connection-id="connectionId"
          :initial-app-id="tab.params?.yarnAppFilterId"
      />
    </div>
    <div v-show="activeView === 'nodes'" class="connector-workbench__panel">
      <YarnNodesPanel ref="nodesRef" :connection-id="connectionId"/>
    </div>
    <div v-show="activeView === 'queues'" class="connector-workbench__panel">
      <YarnQueuesPanel ref="queuesRef" :connection-id="connectionId"/>
    </div>
  </ConnectorWorkbenchFrame>
</template>
