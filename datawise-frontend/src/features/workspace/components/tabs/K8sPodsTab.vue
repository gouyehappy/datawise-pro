<script setup lang="ts">
defineOptions({name: 'K8sPodsTab'})

import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import K8sPodsPanel from '@/features/workspace/components/k8s/K8sPodsPanel.vue'
import K8sResourceTabShell from '@/features/workspace/components/k8s/K8sResourceTabShell.vue'
import type {WorkspaceTab} from '@/core/types'

const props = defineProps<{ tab: WorkspaceTab }>()

const {t} = useI18n()
const explorer = useExplorerStore()
const panelRef = ref<InstanceType<typeof K8sPodsPanel> | null>(null)
const namespaceLabel = ref(props.tab.params?.k8sNamespace?.trim() || '')

const connectionId = computed(() => props.tab.connectionId ?? '')
const connectionLabel = computed(() => {
  if (!connectionId.value) return t('explorer.k8sPods.noConnection')
  return explorer.findNode(connectionId.value)?.label ?? connectionId.value
})

function refresh() {
  panelRef.value?.refresh()
}
</script>

<template>
  <K8sResourceTabShell
      :connection-id="connectionId"
      :fallback-label="connectionLabel"
      :badge="namespaceLabel || tab.params?.k8sNamespace"
      @refresh="refresh"
  >
    <template #refresh-label>{{ t('explorer.k8sCommon.refresh') }}</template>
    <K8sPodsPanel
        ref="panelRef"
        class="connector-workbench__panel"
        :connection-id="connectionId"
        :preferred-namespace="tab.params?.k8sNamespace"
        @namespace-label="namespaceLabel = $event"
    />
  </K8sResourceTabShell>
</template>
