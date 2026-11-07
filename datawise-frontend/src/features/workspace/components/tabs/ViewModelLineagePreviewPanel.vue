<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton, DwPanelState, EmptyState} from '@/core/components'
import LineageColumnMapView from '@/features/lineage/components/LineageColumnMapView.vue'
import type {LineageGraph} from '@/features/lineage/types/lineage.types'
import {buildColumnLineageMap, hasColumnLineage} from '@/features/lineage/services/lineage-column-map.service'

const props = defineProps<{
    graph: LineageGraph | null
    loading: boolean
    error: string | null
    modelName: string
}>()

defineEmits<{
    refresh: []
}>()

const {t} = useI18n()

const columnMap = computed(() => buildColumnLineageMap(props.graph))
const hasContent = computed(() => hasColumnLineage(columnMap.value))
const status = computed(() => props.graph?.meta?.status ?? 'failed')
const warnings = computed(() => props.graph?.meta?.warnings ?? [])
</script>

<template>
  <div class="vm-lineage-preview" data-wb-recipe="wb-canvas">
    <header class="vm-lineage-preview__toolbar">
      <div class="vm-lineage-preview__title">
        <span>{{ t('viewModel.lineagePreviewTitle') }}</span>
        <span v-if="graph?.meta?.parser" class="vm-lineage-preview__meta">
          {{ graph.meta.parser }} · {{ t(`lineage.status.${status}`) }}
        </span>
      </div>
      <div class="vm-lineage-preview__actions">
        <DwButton type="button" variant="secondary" size="sm" :disabled="loading" @click="$emit('refresh')">
          {{ t('lineage.refresh') }}
        </DwButton>
      </div>
    </header>

    <div v-if="warnings.length" class="vm-lineage-preview__warnings">
      <p v-for="(warning, index) in warnings" :key="`${warning.code}-${index}`">
        {{ warning.message }}
      </p>
    </div>

    <div class="vm-lineage-preview__body">
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
          :graph="graph"
          compact
      />
    </div>
  </div>
</template>

<style scoped>
.vm-lineage-preview {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: var(--dw-bg-base);
}

.vm-lineage-preview__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.vm-lineage-preview__body :deep(.er-lineage) {
  flex: 1;
  min-height: 0;
}

.vm-lineage-preview__body :deep(.er-lineage__canvas-wrap) {
  flex: 1;
  min-height: 0;
}

.vm-lineage-preview__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap);
  padding: var(--dw-space-3) var(--dw-space-5);
  border-bottom: 1px solid var(--dw-border-subtle);
}

.vm-lineage-preview__title {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-1);
  font-size: var(--dw-text-sm);
  font-weight: 600;
}

.vm-lineage-preview__meta {
  font-size: var(--dw-text-xs);
  font-weight: 400;
  color: var(--dw-text-muted);
}

.vm-lineage-preview__actions {
  display: flex;
  gap: var(--dw-gap-sm);
}

.vm-lineage-preview__warnings {
  padding: var(--dw-space-3) var(--dw-space-5);
  background: color-mix(in srgb, var(--dw-warning) 12%, transparent);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
}
</style>
