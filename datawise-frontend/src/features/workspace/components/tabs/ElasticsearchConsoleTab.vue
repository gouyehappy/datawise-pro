<script setup lang="ts">
defineOptions({name: 'ElasticsearchConsoleTab'})

import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'
import type {WorkspaceTab} from '@/core/types'
import {readAdvancedProperty} from '@/features/connection/utils/advanced-config'
import ElasticsearchDocumentsPanel from '@/features/elasticsearch/components/ElasticsearchDocumentsPanel.vue'
import ElasticsearchRestPanel from '@/features/elasticsearch/components/ElasticsearchRestPanel.vue'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {fetchConnectionConfig} from '@/shared/config/connections-catalog.service'
import {getTabParam, setTabParam} from '@/features/workspace/services/workspace-tab-params'
import {openUrl} from '@/shared/browser/open-url'

const props = defineProps<{ tab: WorkspaceTab }>()

const {t} = useI18n()
const explorer = useExplorerStore()
const documentsRef = ref<InstanceType<typeof ElasticsearchDocumentsPanel> | null>(null)
const restRef = ref<InstanceType<typeof ElasticsearchRestPanel> | null>(null)
const endpointLabel = ref('')

const connectionId = computed(() => props.tab.connectionId ?? '')
const connectionName = computed(() => {
    if (!connectionId.value) return t('explorer.elasticsearchDocuments.pickIndex')
    return explorer.findNode(connectionId.value)?.label ?? connectionId.value
})
const indexBadge = computed(() => props.tab.tableName?.trim() || '')

const activeView = computed({
    get: (): 'documents' | 'rest' =>
        getTabParam(props.tab, 'elasticsearchView') === 'documents' ? 'documents' : 'rest',
    set: (value: 'documents' | 'rest') => {
        setTabParam(props.tab, 'elasticsearchView', value)
    },
})

async function loadHeader() {
    if (!connectionId.value) {
        endpointLabel.value = ''
        return
    }
    const config = await fetchConnectionConfig(connectionId.value)
    if (!config) {
        endpointLabel.value = connectionName.value
        return
    }
    if (config.url?.trim()) {
        endpointLabel.value = config.url.trim()
        return
    }
    const https = readAdvancedProperty(config.advancedConfig, 'useHttps')
    const scheme = https && /^(true|1|yes|on)$/i.test(https) ? 'https' : 'http'
    const host = config.host?.trim() || 'localhost'
    const port = config.port?.trim() || '9200'
    endpointLabel.value = `${scheme}://${host}:${port}`
}

function openEndpoint() {
    void openUrl(endpointLabel.value)
}

function refresh() {
    if (activeView.value === 'documents') documentsRef.value?.refresh()
    else restRef.value?.refresh()
}

function onIndexName(value: string) {
    props.tab.tableName = value || undefined
}

onMounted(() => {
    void loadHeader()
})
watch(connectionId, () => {
    void loadHeader()
})
watch(
    () => props.tab.params?.elasticsearchMetadataKind,
    (kind) => {
        if (kind) activeView.value = 'rest'
    },
    {immediate: true},
)

function onMetadataConsumed() {
    setTabParam(props.tab, 'elasticsearchMetadataKind', undefined)
}
</script>

<template>
  <div class="es-workbench">
    <header class="es-workbench__head">
      <div class="es-workbench__identity">
        <DwIcon name="database" size="sm" class="es-workbench__icon"/>
        <span class="es-workbench__endpoint" :title="endpointLabel">{{ endpointLabel || connectionName }}</span>
        <span v-if="indexBadge" class="es-workbench__badge">{{ indexBadge }}</span>
      </div>
      <div class="es-workbench__actions">
        <button
            type="button"
            class="dw-text-btn"
            :disabled="!/^https?:\/\//i.test(endpointLabel)"
            @click="openEndpoint"
        >
          {{ t('explorer.elasticsearchWorkbench.openEndpoint') }}
        </button>
        <button type="button" class="dw-text-btn" @click="refresh">
          {{ t('explorer.elasticsearchWorkbench.refresh') }}
        </button>
      </div>
    </header>

    <div class="es-workbench__tabs" role="tablist">
      <button
          type="button"
          role="tab"
          :aria-selected="activeView === 'documents'"
          :class="{ 'is-active': activeView === 'documents' }"
          @click="activeView = 'documents'"
      >
        {{ t('explorer.elasticsearchWorkbench.documents') }}
      </button>
      <button
          type="button"
          role="tab"
          :aria-selected="activeView === 'rest'"
          :class="{ 'is-active': activeView === 'rest' }"
          @click="activeView = 'rest'"
      >
        {{ t('explorer.elasticsearchWorkbench.rest') }}
      </button>
    </div>

    <div class="es-workbench__body">
      <ElasticsearchDocumentsPanel
          v-show="activeView === 'documents'"
          ref="documentsRef"
          class="es-workbench__panel"
          :connection-id="connectionId"
          :index-name="tab.tableName ?? ''"
          @update:index-name="onIndexName"
      />
      <ElasticsearchRestPanel
          v-show="activeView === 'rest'"
          ref="restRef"
          class="es-workbench__panel"
          :connection-id="connectionId"
          :index-name="tab.tableName ?? ''"
          :metadata-kind="tab.params?.elasticsearchMetadataKind"
          @update:index-name="onIndexName"
          @metadata-consumed="onMetadataConsumed"
      />
    </div>
  </div>
</template>

<style scoped>
.es-workbench {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--dw-wb-body-bg, var(--dw-bg-editor));
}

.es-workbench__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-space-4);
  flex-shrink: 0;
  min-height: 2.25rem;
  padding: 0.45rem 0.75rem;
  border-bottom: 1px solid var(--dw-border);
  background: var(--dw-bg-panel);
}

.es-workbench__identity {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
  font-size: var(--dw-text-sm);
}

.es-workbench__icon {
  flex-shrink: 0;
  color: var(--dw-primary);
}

.es-workbench__endpoint {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  color: var(--dw-text);
}

.es-workbench__badge {
  flex-shrink: 0;
  max-width: 12rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0.1rem 0.45rem;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius-sm);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  font-family: var(--dw-mono);
}

.es-workbench__actions {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}

.es-workbench__tabs {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
  padding: 0.35rem 0.75rem;
  border-bottom: 1px solid var(--dw-border);
  background: var(--dw-bg-panel);
}

.es-workbench__tabs button {
  height: 1.75rem;
  padding: 0 0.75rem;
  border-radius: var(--dw-control-radius-sm);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
}

.es-workbench__tabs button:hover {
  color: var(--dw-text);
  background: var(--dw-bg-hover);
  box-shadow: none;
}

.es-workbench__tabs button.is-active {
  color: var(--dw-text);
  font-weight: 600;
  background: var(--dw-bg-muted);
}

.es-workbench__body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.es-workbench__panel {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  padding: 0;
}
</style>
