<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import type {ExplainMetricPair, ExplainPlanNode} from '@/features/workspace/types/explain-plan'
import type {ExplainPlanNodeRisk} from '@/features/workspace/services/explain-plan-risk.service'

const props = defineProps<{
  node: ExplainPlanNode
  depth: number
  collapsed: Record<string, boolean>
  risks?: Map<string, ExplainPlanNodeRisk>
}>()

const emit = defineEmits<{
  toggle: [id: string]
}>()

const {t, te} = useI18n()

function riskLevel(nodeId: string) {
  return props.risks?.get(nodeId)?.level ?? 'none'
}

function metricEntries(node: ExplainPlanNode): [string, string | number][] {
  if (!node.metrics || node.metricPairs?.length) return []
  return Object.entries(node.metrics)
}

function metricLabel(key: string): string {
  const i18nKey = `queryResult.explainColumn.${key}`
  return te(i18nKey) ? t(i18nKey) : key
}

function pairLabel(id: ExplainMetricPair['id']) {
  return t(`queryResult.explainMetric.${id}`)
}
</script>

<template>
  <li class="explain-node">
    <div
        class="explain-node__row"
        :class="`explain-node__row--${riskLevel(node.id)}`"
        :style="{ paddingLeft: `${depth * 16 + 8}px` }"
    >
      <button
          v-if="node.children?.length"
          class="explain-node__toggle"
          type="button"
          :aria-expanded="!collapsed[node.id]"
          @click="emit('toggle', node.id)"
      >
        {{ collapsed[node.id] ? '▸' : '▾' }}
      </button>
      <span v-else class="explain-node__spacer" aria-hidden="true"/>

      <div class="explain-node__body">
        <div class="explain-node__label-row">
          <div class="explain-node__label">{{ node.label }}</div>
          <span
              v-if="riskLevel(node.id) === 'warning'"
              class="explain-node__risk explain-node__risk--warning"
          >
            {{ t('queryResult.explainPlanRiskWarning') }}
          </span>
          <span
              v-else-if="riskLevel(node.id) === 'info'"
              class="explain-node__risk explain-node__risk--info"
          >
            {{ t('queryResult.explainPlanRiskInfo') }}
          </span>
        </div>
        <div v-if="node.detail" class="explain-node__detail">{{ node.detail }}</div>
        <table v-if="node.metricPairs?.length" class="explain-node__pairs">
          <thead>
            <tr>
              <th scope="col"/>
              <th scope="col">{{ t('queryResult.explainMetric.estimate') }}</th>
              <th scope="col">{{ t('queryResult.explainMetric.actual') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="pair in node.metricPairs" :key="pair.id">
              <th scope="row">{{ pairLabel(pair.id) }}</th>
              <td>{{ pair.estimate ?? '—' }}</td>
              <td>{{ pair.actual ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
        <dl v-else-if="metricEntries(node).length" class="explain-node__metrics">
          <template v-for="([key, value], metricIndex) in metricEntries(node)" :key="metricIndex">
            <dt>{{ metricLabel(key) }}</dt>
            <dd>{{ value }}</dd>
          </template>
        </dl>
      </div>
    </div>

    <ul v-if="node.children?.length && !collapsed[node.id]" class="explain-node__children">
      <ExplainPlanNode
          v-for="child in node.children"
          :key="child.id"
          :node="child"
          :depth="depth + 1"
          :collapsed="collapsed"
          :risks="risks"
          @toggle="emit('toggle', $event)"
      />
    </ul>
  </li>
</template>

<style scoped>
.explain-node__children {
  list-style: none;
  margin: 0;
  padding: 0;
}

.explain-node__row {
  display: flex;
  gap: var(--dw-gap-sm);
  align-items: flex-start;
  padding: var(--dw-pad-control-lg);
  border-bottom: 1px solid var(--dw-border-light);
}

.explain-node__row--warning {
  background: color-mix(in srgb, var(--dw-warning) 10%, transparent);
}

.explain-node__row--info {
  background: color-mix(in srgb, var(--dw-info) 8%, transparent);
}

.explain-node__label-row {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  flex-wrap: wrap;
}

.explain-node__risk {
  padding: var(--dw-space-1) var(--dw-space-2);
  border-radius: var(--dw-radius-pill);
  font-size: var(--dw-text-xs);
  font-weight: 600;
}

.explain-node__risk--warning {
  color: var(--dw-warning);
  background: color-mix(in srgb, var(--dw-warning) 16%, transparent);
}

.explain-node__risk--info {
  color: var(--dw-info);
  background: color-mix(in srgb, var(--dw-info) 14%, transparent);
}

.explain-node__toggle {
  flex-shrink: 0;
  width: var(--dw-icon-size-lg);
  height: var(--dw-icon-size-lg);
  border: none;
  border-radius: var(--dw-radius-sm);
  background: var(--dw-bg-muted);
  color: var(--dw-text-secondary);
  cursor: pointer;
  font-size: var(--dw-text-xs);
  line-height: 1;
}

.explain-node__spacer {
  flex-shrink: 0;
  width: var(--dw-icon-size-lg);
}

.explain-node__label {
  font-size: var(--dw-text-md);
  font-weight: 600;
  color: var(--dw-text);
}

.explain-node__detail {
  margin-top: var(--dw-space-1);
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading);
  color: var(--dw-text-secondary);
}

.explain-node__metrics {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--dw-space-1) var(--dw-space-5);
  margin: var(--dw-space-3) 0 0;
  font-size: var(--dw-text-xs);
}

.explain-node__pairs {
  width: 100%;
  margin: var(--dw-space-4) 0 0;
  border-collapse: collapse;
  font-size: var(--dw-text-xs);
}

.explain-node__pairs th,
.explain-node__pairs td {
  padding: var(--dw-space-1) var(--dw-space-4);
  border: 1px solid var(--dw-border-subtle);
  text-align: left;
}

.explain-node__pairs thead th {
  color: var(--dw-text-muted);
  font-weight: 600;
}

.explain-node__pairs tbody th {
  color: var(--dw-text-muted);
  font-weight: 500;
}

.explain-node__pairs td {
  font-family: var(--dw-mono);
  color: var(--dw-text-secondary);
}

.explain-node__metrics dt {
  margin: 0;
  color: var(--dw-text-muted);
}

.explain-node__metrics dd {
  margin: 0;
  font-family: var(--dw-mono);
  color: var(--dw-text-secondary);
}
</style>
