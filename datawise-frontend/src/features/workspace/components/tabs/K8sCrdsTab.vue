<script setup lang="ts">
defineOptions({name: 'K8sCrdsTab'})

import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import K8sCrdsPanel from '@/features/workspace/components/k8s/K8sCrdsPanel.vue'
import K8sResourceTabShell from '@/features/workspace/components/k8s/K8sResourceTabShell.vue'
import type {WorkspaceTab} from '@/core/types'

const props = defineProps<{ tab: WorkspaceTab }>()

const {t} = useI18n()
const explorer = useExplorerStore()
const panelRef = ref<InstanceType<typeof K8sCrdsPanel> | null>(null)

const connectionId = computed(() => props.tab.connectionId ?? '')
const connectionLabel = computed(() => {
  if (!connectionId.value) return t('explorer.k8sCrds.noConnection')
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
      @refresh="refresh"
  >
    <template #refresh-label>{{ t('explorer.k8sCommon.refresh') }}</template>
    <K8sCrdsPanel
        ref="panelRef"
        class="connector-workbench__panel"
        :connection-id="connectionId"
    />
  </K8sResourceTabShell>
</template>