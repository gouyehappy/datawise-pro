<script setup lang="ts">
/**
 * Shared compact shell for K8s resource tabs (Pods / Deployments / …).
 * Matches connector workbench head density: endpoint + optional namespace badge.
 */
import {DwIcon} from '@/core/icons'
import {formatHttpEndpoint} from '@/features/connection'
import ConnectorWorkbenchFrame from '@/features/workspace/components/shared/ConnectorWorkbenchFrame.vue'
import {
    connectorEndpointFromConfig,
    useConnectorWorkbenchHeader,
} from '@/features/workspace/composables/useConnectorWorkbenchHeader'

const props = defineProps<{
  connectionId: string
  fallbackLabel: string
  badge?: string | null
}>()

const emit = defineEmits<{ refresh: [] }>()

const {displayEndpoint} = useConnectorWorkbenchHeader({
  connectionId: () => props.connectionId,
  noConnectionLabel: () => props.fallbackLabel,
  formatEndpoint: (config, fallback) =>
      connectorEndpointFromConfig(config, fallback, (cfg) =>
          formatHttpEndpoint('kubernetes', cfg.host, cfg.port, cfg.advancedConfig),
      ),
})
</script>

<template>
  <ConnectorWorkbenchFrame
      class="k8s-resource-tab"
      :endpoint="displayEndpoint"
      :badge="badge"
  >
    <template #icon>
      <DwIcon name="cpu" size="sm"/>
    </template>
    <template #actions>
      <slot name="actions">
        <button type="button" class="dw-text-btn" @click="emit('refresh')">
          <slot name="refresh-label">Refresh</slot>
        </button>
      </slot>
    </template>
    <div class="connector-workbench__panel">
      <slot/>
    </div>
  </ConnectorWorkbenchFrame>
</template>
