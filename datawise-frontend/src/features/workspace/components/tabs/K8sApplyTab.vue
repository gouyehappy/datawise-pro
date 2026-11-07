<script setup lang="ts">
defineOptions({name: 'K8sApplyTab'})

import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import K8sApplyPanel from '@/features/workspace/components/k8s/K8sApplyPanel.vue'
import K8sResourceTabShell from '@/features/workspace/components/k8s/K8sResourceTabShell.vue'
import type {WorkspaceTab} from '@/core/types'

const props = defineProps<{ tab: WorkspaceTab }>()

const {t} = useI18n()
const explorer = useExplorerStore()
const panelRef = ref<InstanceType<typeof K8sApplyPanel> | null>(null)

const connectionId = computed(() => props.tab.connectionId ?? '')
const connectionLabel = computed(() => {
  if (!connectionId.value) return t('explorer.k8sApply.noConnection')
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
      :badge="tab.params?.k8sNamespace"
      @refresh="refresh"
  >
    <template #refresh-label>{{ t('explorer.k8sCommon.refresh') }}</template>
    <K8sApplyPanel
        ref="panelRef"
        class="connector-workbench__panel"
        :connection-id="connectionId"
        :preferred-namespace="tab.params?.k8sNamespace"
    />
  </K8sResourceTabShell>
</template>