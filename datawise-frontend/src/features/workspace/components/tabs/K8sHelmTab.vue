<script setup lang="ts">
defineOptions({name: 'K8sHelmTab'})

import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import K8sHelmPanel from '@/features/workspace/components/k8s/K8sHelmPanel.vue'
import K8sResourceTabShell from '@/features/workspace/components/k8s/K8sResourceTabShell.vue'
import CapabilityProbeBanner from '@/features/workspace/components/shared/CapabilityProbeBanner.vue'
import {useCapabilityProbe} from '@/features/workspace/composables/useCapabilityProbe'
import type {WorkspaceTab} from '@/core/types'

const props = defineProps<{ tab: WorkspaceTab }>()

const {t} = useI18n()
const explorer = useExplorerStore()
const panelRef = ref<InstanceType<typeof K8sHelmPanel> | null>(null)

const connectionId = computed(() => props.tab.connectionId ?? '')
const dbType = computed(() => {
  const node = connectionId.value ? explorer.findNode(connectionId.value) : null
  return String(node?.dbType || props.tab.dbType || 'kubernetes')
})
const {probe, probing, isLive, refresh: refreshProbe} = useCapabilityProbe({
  connectionId,
  dbType,
})
const helmOk = computed(() => isLive('helm') && isLive('surface'))

const connectionLabel = computed(() => {
  if (!connectionId.value) return t('explorer.k8sHelm.noConnection')
  return explorer.findNode(connectionId.value)?.label ?? connectionId.value
})

function refresh() {
  void refreshProbe()
  panelRef.value?.refresh()
}
</script>

<template>
  <K8sResourceTabShell
      :connection-id="connectionId"
      :fallback-label="connectionLabel"
      :badge="tab.params?.k8sNamespace"
      @refresh="refresh"
  >
    <template #refresh-label>{{ t('explorer.k8sCommon.refresh') }}</template>
    <CapabilityProbeBanner
        :probe="probe"
        :probing="probing"
        capability="helm"
    />
    <K8sHelmPanel
        v-if="helmOk"
        ref="panelRef"
        class="connector-workbench__panel"
        :connection-id="connectionId"
        :preferred-namespace="tab.params?.k8sNamespace"
    />
  </K8sResourceTabShell>
</template>
