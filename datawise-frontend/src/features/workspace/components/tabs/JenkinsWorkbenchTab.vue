<script setup lang="ts">
defineOptions({name: 'JenkinsWorkbenchTab'})

import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'
import type {WorkspaceTab} from '@/core/types'
import {formatHttpEndpoint} from '@/features/connection'
import ConnectorWorkbenchFrame from '@/features/workspace/components/shared/ConnectorWorkbenchFrame.vue'
import JenkinsJobsPanel from '@/features/workspace/components/jenkins/JenkinsJobsPanel.vue'
import JenkinsNodesPanel from '@/features/workspace/components/jenkins/JenkinsNodesPanel.vue'
import {
    connectorEndpointFromConfig,
    useConnectorWorkbenchHeader,
} from '@/features/workspace/composables/useConnectorWorkbenchHeader'
import {getTabParam, setTabParam} from '@/features/workspace/services/workspace-tab-params'

const props = defineProps<{ tab: WorkspaceTab }>()

const {t} = useI18n()
const jobsRef = ref<InstanceType<typeof JenkinsJobsPanel> | null>(null)
const nodesRef = ref<InstanceType<typeof JenkinsNodesPanel> | null>(null)

const {
    connectionId,
    displayEndpoint,
    canOpenConsole,
    openConsole,
} = useConnectorWorkbenchHeader({
    connectionId: () => props.tab.connectionId ?? '',
    noConnectionLabel: () => t('explorer.jenkinsJobs.noConnection'),
    formatEndpoint: (config, fallback) =>
        connectorEndpointFromConfig(config, fallback, (cfg) =>
            formatHttpEndpoint('jenkins', cfg.host, cfg.port, cfg.advancedConfig),
        ),
})

const activeView = computed({
  get: (): 'jobs' | 'nodes' => {
    const view = getTabParam(props.tab, 'jenkinsView')
    if (view === 'jobs' || view === 'nodes') return view
    return props.tab.type === 'jenkins-nodes' ? 'nodes' : 'jobs'
  },
  set: (value: 'jobs' | 'nodes') => {
    setTabParam(props.tab, 'jenkinsView', value)
  },
})

function refresh() {
  if (activeView.value === 'jobs') jobsRef.value?.refresh()
  else nodesRef.value?.refresh()
}
</script>

<template>
  <ConnectorWorkbenchFrame
      class="jenkins-workbench"
      :endpoint="displayEndpoint"
  >
    <template #icon>
      <DwIcon name="tab-jenkins" size="sm"/>
    </template>
    <template #actions>
      <button
          type="button"
          class="dw-text-btn"
          :disabled="!canOpenConsole"
          @click="openConsole"
      >
        {{ t('explorer.jenkinsWorkbench.openConsole') }}
      </button>
      <button type="button" class="dw-text-btn" @click="refresh">
        {{ t('explorer.jenkinsJobs.refresh') }}
      </button>
    </template>
    <template #tabs>
      <button
          type="button"
          role="tab"
          :aria-selected="activeView === 'jobs'"
          :class="{ 'is-active': activeView === 'jobs' }"
          @click="activeView = 'jobs'"
      >
        {{ t('explorer.jenkinsWorkbench.jobs') }}
      </button>
      <button
          type="button"
          role="tab"
          :aria-selected="activeView === 'nodes'"
          :class="{ 'is-active': activeView === 'nodes' }"
          @click="activeView = 'nodes'"
      >
        {{ t('explorer.jenkinsWorkbench.nodes') }}
      </button>
    </template>

    <div
        v-show="activeView === 'jobs'"
        class="connector-workbench__panel"
    >
      <JenkinsJobsPanel ref="jobsRef" :connection-id="connectionId"/>
    </div>
    <div
        v-show="activeView === 'nodes'"
        class="connector-workbench__panel"
    >
      <JenkinsNodesPanel ref="nodesRef" :connection-id="connectionId"/>
    </div>
  </ConnectorWorkbenchFrame>
</template>
