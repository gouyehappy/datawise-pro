<script setup lang="ts">
import {computed} from 'vue'
import {Handle, Position} from '@vue-flow/core'
import type {TableRelationGraphColumn} from '@/features/workspace/services/table-relation-graph.service'

export type SchemaErFlowColumn = TableRelationGraphColumn & {
  typeLabel: string
}

const props = defineProps<{
  data: {
    title: string
    role: string
    columns: SchemaErFlowColumn[]
    moreCount: number
    moreLabel: string
    width: number
    linkMode: boolean
    linkColumn?: string | null
    inspectedColumn?: string | null
    onColumnClick?: (column: SchemaErFlowColumn, event: MouseEvent) => void
    onColumnDblClick?: (column: SchemaErFlowColumn, event: MouseEvent) => void
  }
  selected?: boolean
}>()

const visibleColumns = computed(() => props.data.columns)
</script>

<template>
  <div
      class="schema-er-flow-node"
      :class="{
        'is-center': data.role === 'center',
        'is-selected': selected,
        'is-link-mode': data.linkMode,
      }"
      :style="{ width: `${data.width}px` }"
  >
    <header class="schema-er-flow-node__head">
      <strong>{{ data.title }}</strong>
    </header>
    <ul class="schema-er-flow-node__cols">
      <li
          v-for="col in visibleColumns"
          :key="col.name"
          class="schema-er-flow-node__col"
          :class="{
            'is-highlight': col.highlighted,
            'is-pk': col.keyType === 'PRI',
            'is-fk': col.highlighted && col.keyType !== 'PRI',
            'is-link-pick': data.linkColumn === col.name,
            'is-inspected': data.inspectedColumn === col.name,
            'is-linkable': data.linkMode,
          }"
          @click.stop="data.onColumnClick?.(col, $event)"
          @dblclick.stop="data.onColumnDblClick?.(col, $event)"
      >
        <Handle
            class="schema-er-flow-node__handle schema-er-flow-node__handle--left"
            type="target"
            :position="Position.Left"
            :id="`in:${col.name}`"
        />
        <span class="schema-er-flow-node__name">{{ col.name }}</span>
        <span class="schema-er-flow-node__type">{{ col.typeLabel }}</span>
        <span class="schema-er-flow-node__comment">{{ col.comment || '—' }}</span>
        <Handle
            class="schema-er-flow-node__handle schema-er-flow-node__handle--right"
            type="source"
            :position="Position.Right"
            :id="`out:${col.name}`"
        />
      </li>
      <li v-if="data.moreCount > 0" class="schema-er-flow-node__more">
        {{ data.moreLabel }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.schema-er-flow-node {
  overflow: hidden;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-panel);
  box-shadow: 0 1px 4px color-mix(in srgb, var(--dw-text) 10%, transparent);
  font-size: var(--dw-text-xs);
}

.schema-er-flow-node.is-center {
  border-color: color-mix(in srgb, var(--dw-primary) 55%, var(--dw-border));
}

.schema-er-flow-node.is-selected {
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--dw-primary) 40%, transparent);
}

.schema-er-flow-node__head {
  padding: 8px 10px;
  border-bottom: 1px solid var(--dw-border);
  background: linear-gradient(
      180deg,
      var(--dw-grid-chrome-top, var(--dw-bg-muted)) 0%,
      var(--dw-grid-chrome, var(--dw-bg-panel)) 100%
  );
  text-align: center;
}

.schema-er-flow-node__head strong {
  color: var(--dw-text);
  font-size: var(--dw-text-sm);
  word-break: break-all;
}

.schema-er-flow-node__cols {
  margin: 0;
  padding: 4px 0;
  list-style: none;
}

.schema-er-flow-node__col {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) 36px minmax(0, 0.9fr);
  gap: 4px;
  align-items: center;
  min-height: var(--dw-icon-size-xl);
  padding: 2px 10px;
  cursor: pointer;
}

.schema-er-flow-node__col:hover,
.schema-er-flow-node__col.is-inspected {
  background: color-mix(in srgb, var(--dw-primary) 10%, transparent);
}

.schema-er-flow-node__col.is-highlight {
  background: color-mix(in srgb, var(--dw-info) 12%, transparent);
}

.schema-er-flow-node__col.is-link-pick {
  outline: 1px solid var(--dw-primary);
  outline-offset: -1px;
}

.schema-er-flow-node.is-link-mode .schema-er-flow-node__col.is-linkable:hover {
  background: color-mix(in srgb, var(--dw-success) 14%, transparent);
}

.schema-er-flow-node__name,
.schema-er-flow-node__comment {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.schema-er-flow-node__name {
  color: var(--dw-text);
}

.schema-er-flow-node__type {
  color: var(--dw-text-muted);
  font-size: var(--dw-text-2xs);
  text-align: center;
}

.schema-er-flow-node__col.is-pk .schema-er-flow-node__type {
  color: var(--dw-warning-fg);
  font-weight: 700;
}

.schema-er-flow-node__col.is-fk .schema-er-flow-node__type {
  color: var(--dw-info-fg);
  font-weight: 700;
}

.schema-er-flow-node__comment {
  color: var(--dw-text-muted);
  font-size: var(--dw-text-2xs);
}

.schema-er-flow-node__more {
  padding: 2px 10px 6px;
  color: var(--dw-text-muted);
  text-align: center;
}

.schema-er-flow-node__handle {
  width: 7px !important;
  height: 7px !important;
  top: 50% !important;
  background: var(--dw-bg-panel) !important;
  border: 1px solid var(--dw-border) !important;
}

.schema-er-flow-node__handle--left {
  left: -4px !important;
}

.schema-er-flow-node__handle--right {
  right: -4px !important;
}
</style>
