<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import type {ExplainPlanNode} from '@/features/workspace/types/explain-plan'
import {layoutExplainPlanGraph} from '@/features/workspace/services/explain-plan-graph.service'

const props = defineProps<{
  nodes: ExplainPlanNode[]
}>()

const {t} = useI18n()

const layout = computed(() => layoutExplainPlanGraph(props.nodes))

const nodeById = computed(() => {
  const map = new Map(layout.value.nodes.map((node) => [node.id, node]))
  return map
})

const edgePaths = computed(() =>
    layout.value.edges.map((edge) => {
      const from = nodeById.value.get(edge.fromId)
      const to = nodeById.value.get(edge.toId)
      if (!from || !to) return {id: `${edge.fromId}-${edge.toId}`, d: ''}
      const x1 = from.x + from.width / 2
      const y1 = from.y + from.height
      const x2 = to.x + to.width / 2
      const y2 = to.y
      const midY = (y1 + y2) / 2
      return {
        id: `${edge.fromId}-${edge.toId}`,
        d: `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`,
      }
    }),
)

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}
</script>

<template>
  <div class="explain-graph" role="img" :aria-label="t('queryResult.explainPlanGraphAria')">
    <svg
        class="explain-graph__canvas"
        :viewBox="`0 0 ${layout.width} ${layout.height}`"
        :width="layout.width"
        :height="layout.height"
    >
      <defs>
        <marker id="explain-graph-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" class="explain-graph__arrow"/>
        </marker>
      </defs>

      <g class="explain-graph__edges">
        <path
            v-for="edge in edgePaths"
            :key="edge.id"
            class="explain-graph__edge"
            :d="edge.d"
            marker-end="url(#explain-graph-arrow)"
        />
      </g>

      <g
          v-for="node in layout.nodes"
          :key="node.id"
          class="explain-graph__node"
          :class="`explain-graph__node--${node.risk}`"
          :transform="`translate(${node.x}, ${node.y})`"
      >
        <rect
            class="explain-graph__shell"
            :width="node.width"
            :height="node.height"
            rx="8"
            ry="8"
        />
        <text class="explain-graph__label" x="12" y="22">
          {{ truncate(node.label, 28) }}
        </text>
        <text v-if="node.detail" class="explain-graph__detail" x="12" y="40">
          {{ truncate(node.detail, 32) }}
        </text>
        <title>{{ node.label }}{{ node.detail ? ` · ${node.detail}` : '' }}</title>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.explain-graph {
  overflow: auto;
  max-height: 420px;
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg-muted);
}

.explain-graph__canvas {
  display: block;
  min-width: 100%;
}

.explain-graph__edge {
  fill: none;
  stroke: var(--dw-border);
  stroke-width: 1.5;
}

.explain-graph__arrow {
  fill: var(--dw-border);
}

.explain-graph__shell {
  fill: var(--dw-bg-panel);
  stroke: var(--dw-border);
  stroke-width: 1.25;
}

.explain-graph__node--warning .explain-graph__shell {
  fill: color-mix(in srgb, var(--dw-warning) 14%, var(--dw-bg-panel));
  stroke: color-mix(in srgb, var(--dw-warning) 55%, var(--dw-border));
}

.explain-graph__node--info .explain-graph__shell {
  fill: color-mix(in srgb, var(--dw-info) 10%, var(--dw-bg-panel));
  stroke: color-mix(in srgb, var(--dw-info) 40%, var(--dw-border));
}

.explain-graph__label {
  fill: var(--dw-text);
  font-size: var(--dw-text-sm);
  font-weight: 600;
}

.explain-graph__detail {
  fill: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
}
</style>
