<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {EmptyState, DwButton, DwPanelState} from '@/core/components'
import type {WorkspaceTab} from '@/core/types'
import {lineageApi} from '@/api/modules/lineage'
import LineageColumnMapView from '@/features/lineage/components/LineageColumnMapView.vue'
import type {LineageGraph, LineageImpact} from '@/features/lineage/types/lineage.types'
import {hasColumnLineage, buildColumnLineageMap} from '@/features/lineage/services/lineage-column-map.service'

const props = defineProps<{ tab: WorkspaceTab }>()

const {t} = useI18n()

const graph = ref<LineageGraph | null>(null)
const impact = ref<LineageImpact | null>(null)
const loading = ref(false)
const impactLoading = ref(false)
const error = ref<string | null>(null)
const mapViewRef = ref<InstanceType<typeof LineageColumnMapView> | null>(null)

const status = computed(() => graph.value?.meta?.status ?? 'failed')
const statusLabel = computed(() => t(`lineage.status.${status.value}`))
const warnings = computed(() => graph.value?.meta?.warnings ?? [])
const columnMap = computed(() => buildColumnLineageMap(graph.value))
const hasContent = computed(() => hasColumnLineage(columnMap.value))

async function loadImpact() {
    const connectionId = props.tab.connectionId
    const instanceName = props.tab.database ?? props.tab.instanceId ?? undefined
    const name = props.tab.viewModelName
    if (!connectionId || !instanceName || !name) {
        impact.value = null
        return
    }
    impactLoading.value = true
    try {
        impact.value = await lineageApi.getImpact({
            connectionId,
            instanceName: String(instanceName),
            name,
        })
    } catch {
        impact.value = null
    } finally {
        impactLoading.value = false
    }
}

async function load(forceRefresh = false) {
    const connectionId = props.tab.connectionId
    const instanceName = props.tab.database ?? props.tab.instanceId ?? undefined
    const name = props.tab.viewModelName
    if (!connectionId || !instanceName || !name) {
        error.value = t('lineage.missingContext')
        return
    }
    loading.value = true
    error.value = null
    try {
        graph.value = await lineageApi.getViewModelLineage({
            connectionId,
            instanceName: String(instanceName),
            name,
            forceRefresh,
        })
    } catch (ex) {
        error.value = ex instanceof Error ? ex.message : t('lineage.loadFailed')
        graph.value = null
    } finally {
        loading.value = false
    }
}

function fitView() {
    mapViewRef.value?.fitView()
}

watch(
    () => [props.tab.connectionId, props.tab.database, props.tab.instanceId, props.tab.viewModelName],
    () => {
        void load(false)
        void loadImpact()
    },
    {immediate: true},
)
</script>

<template>
  <div class="lineage-panel dw-workbench-page" data-wb-recipe="wb-canvas">
    <header class="lineage-panel__toolbar">
      <div class="lineage-panel__title">
        <h2>{{ tab.viewModelName }}</h2>
        <p class="lineage-panel__subtitle">{{ t('lineage.columnMapHint') }}</p>
        <span v-if="graph?.meta?.parser" class="lineage-panel__meta">
          {{ graph.meta.parser }} ?? {{ statusLabel }}
        </span>
      </div>
      <div class="lineage-panel__actions">
        <DwButton type="button" variant="secondary" size="sm" :disabled="loading || !hasContent" @click="fitView">
          {{ t('lineage.fitView') }}
        </DwButton>
        <DwButton type="button" variant="secondary" size="sm" :disabled="loading" @click="load(true)">
          {{ t('lineage.refresh') }}
        </DwButton>
      </div>
    </header>

    <div v-if="warnings.length" class="lineage-panel__warnings">
      <p v-for="(warning, index) in warnings" :key="`${warning.code}-${index}`">
        {{ warning.message }}
      </p>
    </div>

    <section v-if="impactLoading || impact" class="lineage-panel__impact">
      <h3>{{ t('lineage.downstreamTitle') }}</h3>
      <p v-if="impactLoading" class="lineage-panel__impact-state">{{ t('lineage.loading') }}</p>
      <p v-else-if="!impact?.downstream?.length" class="lineage-panel__impact-state">
        {{ t('lineage.downstreamEmpty') }}
      </p>
      <ul v-else class="lineage-panel__impact-list">
        <li v-for="item in impact.downstream" :key="item.fileName">
          <span>{{ item.modelName }}</span>
          <span v-if="item.staleSidecar" class="lineage-panel__impact-stale">
            {{ t('lineage.downstreamStale') }}
          </span>
        </li>
      </ul>
    </section>

    <DwPanelState
        v-if="loading"
        status="loading"
        :message="t('lineage.loading')"
        fill
    />
    <EmptyState
        v-else-if="error"
        :title="t('lineage.loadFailed')"
        :description="error"
    />
    <EmptyState
        v-else-if="!hasContent"
        :title="t('lineage.emptyTitle')"
        :description="t('lineage.emptyHint')"
    />
    <LineageColumnMapView
        v-else
        ref="mapViewRef"
        :graph="graph"
    />
  </div>
</template>

<style scoped>
.lineage-panel {
  min-height: 0;
  min-width: 0;
  background: var(--dw-wb-body-bg);
}

.lineage-panel__toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--dw-space-6);
  padding: var(--dw-space-5) var(--dw-wb-content-pad-x);
  border-bottom: 1px solid var(--dw-wb-head-border);
  background: var(--dw-wb-head-bg);
  box-shadow: var(--dw-wb-head-shadow);
}

.lineage-panel__title h2 {
  margin: 0;
  font-size: var(--dw-text-lg);
}

.lineage-panel__subtitle {
  margin: var(--dw-space-2) 0 0;
  font-size: var(--dw-text-sm);
  color: var(--dw-text-muted);
}

.lineage-panel__meta {
  display: inline-block;
  margin-top: var(--dw-space-2);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
}

.lineage-panel__actions {
  display: flex;
  gap: var(--dw-gap);
  flex-shrink: 0;
}

.lineage-panel__warnings {
  padding: var(--dw-space-4) var(--dw-space-8);
  background: color-mix(in srgb, var(--dw-warning) 12%, transparent);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
}

.lineage-panel__impact {
  padding: var(--dw-space-4) var(--dw-space-8);
  border-bottom: 1px solid var(--dw-wb-head-border);
}

.lineage-panel__impact h3 {
  margin: 0 0 var(--dw-space-3);
  font-size: var(--dw-text-sm);
  font-weight: 600;
}

.lineage-panel__impact-state {
  margin: 0;
  font-size: var(--dw-text-sm);
  color: var(--dw-text-muted);
}

.lineage-panel__impact-list {
  margin: 0;
  padding-left: 18px;
  font-size: var(--dw-text-sm);
}

.lineage-panel__impact-list li {
  margin-bottom: var(--dw-space-2);
}

.lineage-panel__impact-stale {
  margin-left: var(--dw-space-4);
  color: var(--dw-warning);
  font-size: var(--dw-text-xs);
}

</style>
