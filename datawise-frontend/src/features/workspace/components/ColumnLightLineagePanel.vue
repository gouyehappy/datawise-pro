<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {EmptyState} from '@/core/components'
import type {LightLineageEdge, LightLineageSummary} from '@/features/workspace/services/column-light-lineage.service'

const props = defineProps<{
    summary: LightLineageSummary | null
}>()

const emit = defineEmits<{
    close: []
}>()

const {t} = useI18n()

const hasEdges = computed(() =>
    (props.summary?.upstream.length ?? 0) + (props.summary?.downstream.length ?? 0) > 0,
)

function confidenceLabel(edge: LightLineageEdge) {
    return edge.confidence === 'certain'
        ? t('workspace.tableDetail.lightLineage.certain')
        : t('workspace.tableDetail.lightLineage.possible')
}

function sourceLabel(edge: LightLineageEdge) {
    return t(`workspace.tableDetail.lightLineage.source.${edge.source}`)
}

function peerLabel(edge: LightLineageEdge) {
    return `${edge.peerTable}.${edge.peerColumn}`
}
</script>

<template>
  <section v-if="summary" class="light-lineage" :aria-label="t('workspace.tableDetail.lightLineage.title')">
    <header class="light-lineage__head">
      <div>
        <strong>{{ t('workspace.tableDetail.lightLineage.title') }}</strong>
        <p>{{ t('workspace.tableDetail.lightLineage.hint', {column: summary.column}) }}</p>
      </div>
      <button type="button" class="light-lineage__close" @click="emit('close')">
        {{ t('workspace.tableDetail.lightLineage.close') }}
      </button>
    </header>

    <EmptyState
        v-if="!hasEdges"
        embedded
        :title="t('workspace.tableDetail.lightLineage.empty')"
        :hint="t('workspace.tableDetail.lightLineage.emptyHint')"
    />

    <div v-else class="light-lineage__columns">
      <div class="light-lineage__group">
        <h4>{{ t('workspace.tableDetail.lightLineage.upstream') }}</h4>
        <ul v-if="summary.upstream.length">
          <li v-for="edge in summary.upstream" :key="`up-${peerLabel(edge)}-${edge.source}`">
            <span class="mono">{{ peerLabel(edge) }}</span>
            <span class="light-lineage__meta">
              <span :class="['light-lineage__badge', `is-${edge.confidence}`]">{{ confidenceLabel(edge) }}</span>
              <span>{{ sourceLabel(edge) }}</span>
            </span>
          </li>
        </ul>
        <p v-else class="light-lineage__none">{{ t('workspace.tableDetail.lightLineage.none') }}</p>
      </div>
      <div class="light-lineage__group">
        <h4>{{ t('workspace.tableDetail.lightLineage.downstream') }}</h4>
        <ul v-if="summary.downstream.length">
          <li v-for="edge in summary.downstream" :key="`down-${peerLabel(edge)}-${edge.source}`">
            <span class="mono">{{ peerLabel(edge) }}</span>
            <span class="light-lineage__meta">
              <span :class="['light-lineage__badge', `is-${edge.confidence}`]">{{ confidenceLabel(edge) }}</span>
              <span>{{ sourceLabel(edge) }}</span>
            </span>
          </li>
        </ul>
        <p v-else class="light-lineage__none">{{ t('workspace.tableDetail.lightLineage.none') }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.light-lineage {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-3);
  margin: 0 0 var(--dw-space-3);
  padding: var(--dw-space-3) var(--dw-space-4);
  border: 1px solid color-mix(in srgb, var(--dw-text) 10%, transparent);
  border-radius: var(--dw-control-radius);
  background: color-mix(in srgb, var(--dw-text) 3%, transparent);
}

.light-lineage__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--dw-space-3);
}

.light-lineage__head strong {
  font-size: var(--dw-text-sm);
}

.light-lineage__head p {
  margin: 2px 0 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.light-lineage__close {
  border: 0;
  background: transparent;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  cursor: pointer;
}

.light-lineage__columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--dw-space-3);
}

.light-lineage__group h4 {
  margin: 0 0 6px;
  font-size: var(--dw-text-xs);
  font-weight: 600;
  color: var(--dw-text-secondary);
}

.light-lineage__group ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.light-lineage__group li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 6px 8px;
  border-radius: var(--dw-control-radius);
  background: var(--dw-surface, transparent);
}

.light-lineage__meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.light-lineage__badge {
  padding: 1px 6px;
  border-radius: var(--dw-radius-pill);
  font-weight: 600;
}

.light-lineage__badge.is-certain {
  color: var(--dw-success);
  background: color-mix(in srgb, var(--dw-success) 14%, transparent);
}

.light-lineage__badge.is-possible {
  color: var(--dw-warning);
  background: color-mix(in srgb, var(--dw-warning) 14%, transparent);
}

.light-lineage__none {
  margin: 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}
</style>
