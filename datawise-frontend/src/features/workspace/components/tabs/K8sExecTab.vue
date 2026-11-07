<script setup lang="ts">
defineOptions({name: 'K8sExecTab'})

import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {EmptyState} from '@/core/components'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import K8sExecPane from '@/features/workspace/components/k8s/K8sExecPane.vue'
import K8sResourceTabShell from '@/features/workspace/components/k8s/K8sResourceTabShell.vue'
import type {WorkspaceTab} from '@/core/types'

const props = defineProps<{ tab: WorkspaceTab }>()
const {t} = useI18n()
const explorer = useExplorerStore()

const connectionId = computed(() => props.tab.connectionId ?? '')
const connectionLabel = computed(() => {
  if (!connectionId.value) return t('explorer.k8sExec.noConnection')
  return explorer.findNode(connectionId.value)?.label ?? connectionId.value
})
const namespace = computed(() => props.tab.params?.k8sNamespace ?? 'default')
const podName = computed(() => props.tab.params?.k8sPodName ?? '')
const container = computed(() => props.tab.params?.k8sContainer || undefined)
const badge = computed(() => {
  if (!podName.value) return namespace.value
  return container.value
      ? `${namespace.value}/${podName.value}/${container.value}`
      : `${namespace.value}/${podName.value}`
})
</script>

<template>
  <K8sResourceTabShell
      :connection-id="connectionId"
      :fallback-label="connectionLabel"
      :badge="badge"
  >
    <template #actions>
      <span class="k8s-exec-tab__hint">{{ t('explorer.k8sExec.title') }}</span>
    </template>
    <K8sExecPane
        v-if="connectionId && podName"
        class="connector-workbench__panel"
        :connection-id="connectionId"
        :namespace="namespace"
        :pod-name="podName"
        :container="container"
    />
    <EmptyState
        v-else
        embedded
        compact
        class="k8s-exec-tab__empty"
        :title="t('explorer.k8sExec.missingTarget')"
    />
  </K8sResourceTabShell>
</template>

<style scoped>
.k8s-exec-tab__hint {
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
}

.k8s-exec-tab__empty {
  margin: var(--dw-space-6);
}
</style>
