<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwCodeViewer, DwInlineAlert, DwSplitPane, IconButton} from '@/core/components'
import {DwIcon} from '@/core/icons'
import {explorerApi} from '@/api'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import ConnectorBrowseToolbar from '@/features/workspace/components/shared/ConnectorBrowseToolbar.vue'
import ElasticsearchProfilePanel from '@/features/elasticsearch/components/ElasticsearchProfilePanel.vue'
import {
    applyElasticsearchRestCompletion,
    suggestElasticsearchRestCompletions,
} from '@/features/elasticsearch/services/elasticsearch-completion'
import {formatElasticsearchRestRequest} from '@/features/elasticsearch/services/elasticsearch-formatter'
import {parseElasticsearchProfile} from '@/features/elasticsearch/services/elasticsearch-profile'
import {classifyElasticsearchRequestRisk} from '@/features/elasticsearch/services/elasticsearch-request-risk'
import type {
    ElasticsearchIndexMetadata,
    ElasticsearchRestResult,
} from '@/features/elasticsearch/services/elasticsearch-rest.service'
import '@/features/workspace/components/shared/connector-browse-panel.css'

const props = defineProps<{
    connectionId: string
    indexName?: string
    metadataKind?: 'all' | 'mapping' | 'settings' | 'stats'
}>()

const emit = defineEmits<{
    'update:indexName': [value: string]
    metadataConsumed: []
}>()

const {t} = useI18n()

const requestText = ref(
    props.indexName
        ? `GET /${props.indexName}/_search?size=50&profile=true\n{\n  "query": { "match_all": {} }\n}`
        : 'GET /_cat/indices',
)
const running = ref(false)
const error = ref<string | null>(null)
const result = ref<ElasticsearchRestResult | null>(null)
const metadata = ref<ElasticsearchIndexMetadata | null>(null)
const indexName = ref(props.indexName ?? '')
const viewMode = ref<'json' | 'table' | 'profile'>('json')
const indexNames = ref<string[]>([])
const completions = ref<string[]>([])

const risk = computed(() => classifyElasticsearchRequestRisk(requestText.value))
const hasProfile = computed(() => Boolean(result.value?.rawBody && parseElasticsearchProfile(result.value.rawBody)))

const resultText = computed(() => {
    if (metadata.value) return metadataPretty()
    return pretty(result.value?.rawBody)
})

const resultTitle = computed(() => {
    if (metadata.value) return t('explorer.elasticsearchConsole.metadata')
    if (result.value) return `${result.value.method} ${result.value.path}`
    return t('explorer.elasticsearchConsole.result')
})

watch(
    () => props.indexName,
    (name) => {
        if (name != null) indexName.value = name
    },
)

watch(indexName, (value) => {
    if (value !== (props.indexName ?? '')) emit('update:indexName', value)
})

watch(
    () => props.metadataKind,
    (kind) => {
        if (!kind || !indexName.value.trim()) return
        void loadMetadata(kind === 'all' ? undefined : kind).finally(() => emit('metadataConsumed'))
    },
    {immediate: true},
)

async function refreshIndexNames() {
    if (!props.connectionId) return
    try {
        const indices = await explorerApi.fetchElasticsearchIndices(props.connectionId)
        indexNames.value = (indices.indices ?? []).map((item) => item.name)
    } catch {
        indexNames.value = []
    }
}

function updateCompletions() {
    completions.value = suggestElasticsearchRestCompletions(requestText.value, indexNames.value, 6)
}

function applyCompletion(suggestion: string) {
    requestText.value = applyElasticsearchRestCompletion(requestText.value, suggestion)
    completions.value = []
}

async function runRequest(text = requestText.value) {
    if (!props.connectionId || !text.trim()) return
    const classified = classifyElasticsearchRequestRisk(text)
    if (classified === 'dangerous' || classified === 'write') {
        const ok = window.confirm(t('explorer.elasticsearchConsole.confirmWrite', {risk: classified}))
        if (!ok) return
    }
    running.value = true
    error.value = null
    metadata.value = null
    completions.value = []
    try {
        result.value = await explorerApi.executeElasticsearchRest(props.connectionId, text)
        if (result.value.error) error.value = result.value.error
        if (parseElasticsearchProfile(result.value.rawBody)) viewMode.value = 'profile'
        else if (result.value.tabular) viewMode.value = 'table'
        else viewMode.value = 'json'
    } catch (caught) {
        error.value = resolveCaughtApiErrorMessage(caught, t, 'explorer.elasticsearchConsole.runFailed')
        result.value = null
    } finally {
        running.value = false
    }
}

async function loadMetadata(kind?: string) {
    if (!props.connectionId || !indexName.value.trim()) return
    running.value = true
    error.value = null
    result.value = null
    try {
        metadata.value = await explorerApi.fetchElasticsearchIndexMetadata(
            props.connectionId,
            indexName.value.trim(),
            kind ? {kind} : undefined,
        )
        viewMode.value = 'json'
    } catch (caught) {
        error.value = resolveCaughtApiErrorMessage(caught, t, 'explorer.elasticsearchConsole.runFailed')
        metadata.value = null
    } finally {
        running.value = false
    }
}

async function clearIndex() {
    const index = indexName.value.trim()
    if (!props.connectionId || !index) return
    const ok = window.confirm(t('explorer.elasticsearchConsole.confirmClear', {index}))
    if (!ok) return
    running.value = true
    error.value = null
    try {
        const cleared = await explorerApi.clearElasticsearchIndex(props.connectionId, index)
        metadata.value = null
        result.value = {
            method: 'POST',
            path: `/${index}/_delete_by_query`,
            status: 200,
            risk: 'dangerous',
            rawBody: cleared.rawBody,
            tabular: false,
            columns: [],
            rows: [],
            durationMs: 0,
            error: cleared.timedOut ? 'timed_out' : null,
        }
        viewMode.value = 'json'
        if (cleared.timedOut) error.value = 'timed_out'
    } catch (caught) {
        error.value = resolveCaughtApiErrorMessage(caught, t, 'explorer.elasticsearchConsole.runFailed')
    } finally {
        running.value = false
    }
}

function formatRequest() {
    const formatted = formatElasticsearchRestRequest(requestText.value)
    if (formatted) requestText.value = formatted
}

function pretty(value: string | null | undefined): string {
    if (!value) return ''
    try {
        return JSON.stringify(JSON.parse(value), null, 2)
    } catch {
        return value
    }
}

function metadataPretty(): string {
    if (!metadata.value) return ''
    return pretty(JSON.stringify({
        mapping: safeJson(metadata.value.mappingJson),
        settings: safeJson(metadata.value.settingsJson),
        stats: safeJson(metadata.value.statsJson),
    }))
}

function safeJson(raw: string | null | undefined): unknown {
    if (!raw) return null
    try {
        return JSON.parse(raw)
    } catch {
        return raw
    }
}

function refresh() {
    void refreshIndexNames()
    if (requestText.value.trim()) void runRequest()
}

defineExpose({refresh})
void refreshIndexNames()
</script>

<template>
  <div class="connector-browse-panel connector-workbench-pane">
    <DwInlineAlert v-if="error" density="banner" variant="error" :message="error"/>

    <DwSplitPane
        class="connector-browse-panel__body connector-browse-panel__body--split"
        storage-key="dw.split.es-rest"
        :default-width="320"
        :min-width="240"
        :max-width="560"
        :end-min-width="300"
        :stack-below="900"
        start-class="connector-browse-panel__pane es-rest-pane"
        end-class="connector-browse-panel__pane es-rest-pane"
    >
      <template #start>
        <DwCodeViewer
            v-model:content="requestText"
            class="es-rest__fill"
            :title="t('explorer.elasticsearchConsole.request')"
            :subtitle="risk ?? undefined"
            language="plaintext"
            filename="request.http"
            :readonly="false"
            dark
            card
            @update:content="updateCompletions"
        >
          <template #actions>
            <IconButton
                size="sm"
                class="dw-code-viewer__icon-btn"
                :title="t('explorer.elasticsearchConsole.run')"
                :disabled="running"
                @click="runRequest()"
            >
              <DwIcon name="run" size="sm"/>
            </IconButton>
            <IconButton
                size="sm"
                class="dw-code-viewer__icon-btn"
                :title="t('explorer.elasticsearchConsole.format')"
                :disabled="running"
                @click="formatRequest"
            >
              <DwIcon name="edit" size="sm"/>
            </IconButton>
          </template>
        </DwCodeViewer>
        <div v-if="completions.length" class="es-rest__suggest">
          <button
              v-for="item in completions"
              :key="item"
              type="button"
              class="connector-list__refresh"
              @mousedown.prevent="applyCompletion(item)"
          >
            {{ item.split('\n')[0] }}
          </button>
        </div>
      </template>

      <template #end>
        <ConnectorBrowseToolbar
            class="es-rest__toolbar"
            :query="indexName"
            :query-placeholder="t('explorer.elasticsearchConsole.indexPlaceholder')"
            :disabled="running"
            @update:query="indexName = $event"
        >
          <template #actions>
            <button class="connector-list__refresh" type="button" :disabled="running" @click="loadMetadata('mapping')">
              {{ t('explorer.elasticsearchConsole.metadata') }}
            </button>
            <button class="connector-list__refresh" type="button" :disabled="running" @click="loadMetadata('settings')">
              {{ t('explorer.elasticsearchConsole.settings') }}
            </button>
            <button class="connector-list__refresh" type="button" :disabled="running" @click="loadMetadata('stats')">
              {{ t('explorer.elasticsearchConsole.stats') }}
            </button>
            <button class="connector-list__refresh" type="button" :disabled="running || !indexName.trim()" @click="clearIndex">
              {{ t('explorer.elasticsearchConsole.clear') }}
            </button>
          </template>
        </ConnectorBrowseToolbar>
        <div class="es-rest__modes">
          <button type="button" :class="{ 'is-active': viewMode === 'json' }" @click="viewMode = 'json'">
            {{ t('explorer.elasticsearchConsole.json') }}
          </button>
          <button
              type="button"
              :disabled="!result?.tabular"
              :class="{ 'is-active': viewMode === 'table' }"
              @click="viewMode = 'table'"
          >
            {{ t('explorer.elasticsearchConsole.table') }}
          </button>
          <button
              type="button"
              :disabled="!hasProfile"
              :class="{ 'is-active': viewMode === 'profile' }"
              @click="viewMode = 'profile'"
          >
            {{ t('explorer.elasticsearchConsole.profile') }}
          </button>
        </div>
        <ElasticsearchProfilePanel
            v-if="result && viewMode === 'profile' && hasProfile"
            class="es-rest__fill"
            :body="result.rawBody"
        />
        <div v-else-if="result && viewMode === 'table' && result.tabular" class="connector-list__scroll es-rest__fill">
          <table class="connector-browse-panel__table">
            <thead>
            <tr>
              <th v-for="column in result.columns" :key="column.name">{{ column.name }}</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="(row, index) in result.rows" :key="index">
              <td v-for="column in result.columns" :key="column.name">{{ row[column.name] }}</td>
            </tr>
            </tbody>
          </table>
        </div>
        <DwCodeViewer
            v-else
            class="es-rest__fill"
            :content="resultText"
            :title="resultTitle"
            language="json"
            filename="response.json"
            :loading="running"
            readonly
            dark
            card
            :empty-text="t('explorer.elasticsearchConsole.emptyResult')"
        />
      </template>
    </DwSplitPane>
  </div>
</template>

<style scoped>
:deep(.es-rest-pane) {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.es-rest__toolbar {
  flex-shrink: 0;
  padding: 0.4rem 0.5rem;
  border-bottom: 1px solid var(--dw-border);
}

.es-rest__suggest {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  padding: 0.4rem 0.5rem;
  border-top: 1px solid var(--dw-border);
}

.es-rest__modes {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
  padding: 0.35rem 0.5rem;
  border-bottom: 1px solid var(--dw-border);
}

.es-rest__modes button {
  height: 1.6rem;
  padding: 0 0.65rem;
  border-radius: var(--dw-control-radius-sm);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
}

.es-rest__modes button.is-active {
  color: var(--dw-text);
  font-weight: 600;
  background: var(--dw-bg-muted);
}

.es-rest__modes button:disabled {
  opacity: 0.45;
}

.es-rest__fill {
  flex: 1 1 auto;
  min-height: 0;
}

:deep(.es-rest-pane .dw-code-viewer) {
  flex: 1 1 auto;
  height: auto;
  min-height: 0;
  border: none;
  border-radius: 0;
  box-shadow: none;
}
</style>
