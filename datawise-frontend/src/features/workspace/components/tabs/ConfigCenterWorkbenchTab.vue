<script setup lang="ts">
/**
 * Shared Nacos / Polaris config-center workbench (A-07 + A-08 Kit).
 * Kind is taken from tab.dbType — no per-brand wrapper SFCs.
 */
defineOptions({name: 'ConfigCenterWorkbenchTab'})

import {computed, ref, type Component} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'
import type {WorkspaceTab} from '@/core/types'
import {formatNacosConsoleAddress, formatHttpEndpoint} from '@/features/connection'
import NacosConfigsPanel from '@/features/workspace/components/nacos/NacosConfigsPanel.vue'
import NacosServicesPanel from '@/features/workspace/components/nacos/NacosServicesPanel.vue'
import PolarisConfigsPanel from '@/features/workspace/components/polaris/PolarisConfigsPanel.vue'
import PolarisServicesPanel from '@/features/workspace/components/polaris/PolarisServicesPanel.vue'
import ConnectorWorkbenchFrame from '@/features/workspace/components/shared/ConnectorWorkbenchFrame.vue'
import {
    connectorEndpointFromConfig,
    useConnectorWorkbenchHeader,
} from '@/features/workspace/composables/useConnectorWorkbenchHeader'
import {getTabParam, setTabParam} from '@/features/workspace/services/workspace-tab-params'

const props = defineProps<{tab: WorkspaceTab}>()

const kind = computed<'nacos' | 'polaris'>(() =>
    props.tab.dbType === 'polaris' ? 'polaris' : 'nacos',
)

const {t} = useI18n()
const configsRef = ref<{refresh?: () => void} | null>(null)
const servicesRef = ref<{refresh?: () => void} | null>(null)
const namespaceLabel = ref('')

const i18nPrefix = computed(() =>
    kind.value === 'nacos' ? 'explorer.nacos' : 'explorer.polaris',
)

const {
    connectionId,
    displayEndpoint,
    canOpenConsole,
    openConsole,
} = useConnectorWorkbenchHeader({
    connectionId: () => props.tab.connectionId ?? '',
    noConnectionLabel: () => t(`${i18nPrefix.value}Configs.noConnection`),
    formatEndpoint: (config, fallback) =>
        connectorEndpointFromConfig(config, fallback, (cfg) =>
            kind.value === 'nacos'
                ? formatNacosConsoleAddress(cfg.host, cfg.port, cfg.advancedConfig)
                : formatHttpEndpoint('polaris', cfg.host, cfg.port, cfg.advancedConfig),
        ),
})

const preferredNamespace = computed(() =>
    kind.value === 'nacos'
        ? getTabParam(props.tab, 'nacosNamespace')
        : getTabParam(props.tab, 'polarisNamespace'),
)

const ConfigsPanel = computed<Component>(() =>
    kind.value === 'nacos' ? NacosConfigsPanel : PolarisConfigsPanel,
)
const ServicesPanel = computed<Component>(() =>
    kind.value === 'nacos' ? NacosServicesPanel : PolarisServicesPanel,
)

const activeView = computed({
    get: (): 'configs' | 'services' => {
        if (kind.value === 'nacos') {
            const view = getTabParam(props.tab, 'nacosView')
            if (view === 'configs' || view === 'services') return view
            return props.tab.type === 'nacos-services' ? 'services' : 'configs'
        }
        const view = getTabParam(props.tab, 'polarisView')
        if (view === 'configs' || view === 'services') return view
        return props.tab.type === 'polaris-services' ? 'services' : 'configs'
    },
    set: (value: 'configs' | 'services') => {
        if (kind.value === 'nacos') setTabParam(props.tab, 'nacosView', value)
        else setTabParam(props.tab, 'polarisView', value)
    },
})

function refresh() {
    if (activeView.value === 'configs') configsRef.value?.refresh?.()
    else servicesRef.value?.refresh?.()
}
</script>

<template>
  <ConnectorWorkbenchFrame
      class="config-center-workbench"
      :endpoint="displayEndpoint"
      :badge="namespaceLabel || null"
  >
    <template #icon>
      <DwIcon name="database" size="sm"/>
    </template>
    <template #actions>
      <button
          type="button"
          class="dw-text-btn"
          :disabled="!canOpenConsole"
          @click="openConsole"
      >
        {{ t(`${i18nPrefix}Workbench.openConsole`) }}
      </button>
      <button type="button" class="dw-text-btn" @click="refresh">
        {{ t(`${i18nPrefix}Configs.refresh`) }}
      </button>
    </template>
    <template #tabs>
      <button
          type="button"
          role="tab"
          :aria-selected="activeView === 'configs'"
          :class="{ 'is-active': activeView === 'configs' }"
          @click="activeView = 'configs'"
      >
        {{ t(`${i18nPrefix}Workbench.configs`) }}
      </button>
      <button
          type="button"
          role="tab"
          :aria-selected="activeView === 'services'"
          :class="{ 'is-active': activeView === 'services' }"
          @click="activeView = 'services'"
      >
        {{ t(`${i18nPrefix}Workbench.services`) }}
      </button>
    </template>

    <component
        :is="ConfigsPanel"
        v-show="activeView === 'configs'"
        ref="configsRef"
        class="connector-workbench__panel"
        :connection-id="connectionId"
        :preferred-namespace="preferredNamespace"
        @namespace-label="namespaceLabel = $event"
    />
    <component
        :is="ServicesPanel"
        v-show="activeView === 'services'"
        ref="servicesRef"
        class="connector-workbench__panel"
        :connection-id="connectionId"
        :preferred-namespace="preferredNamespace"
        @namespace-label="namespaceLabel = $event"
    />
  </ConnectorWorkbenchFrame>
</template>
