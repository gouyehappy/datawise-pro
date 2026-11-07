<script setup lang="ts">
import {computed} from 'vue'
import {Handle, Position} from '@vue-flow/core'
import type {DwErTableColumn} from '../types'

const props = withDefaults(
    defineProps<{
      title: string
      roleLabel?: string
      columns: DwErTableColumn[]
      selected?: boolean
      accent?: boolean
      width?: number
      maxRows?: number
      showHandles?: boolean
      moreLabel?: string
    }>(),
    {
      columns: () => [],
      width: 208,
      maxRows: 14,
      showHandles: true,
      moreLabel: '+{n}',
    },
)

const visibleColumns = computed(() => props.columns.slice(0, props.maxRows))
const hiddenCount = computed(() => Math.max(0, props.columns.length - props.maxRows))
</script>

<template>
  <div
      class="dw-er-table-node"
      :class="{ 'is-selected': selected, 'is-accent': accent }"
      :style="{ width: `${width}px` }"
  >
    <header class="dw-er-table-node__head">
      <span v-if="roleLabel" class="dw-er-table-node__role">{{ roleLabel }}</span>
      <strong class="dw-er-table-node__title">{{ title }}</strong>
    </header>
    <ul class="dw-er-table-node__cols">
      <li
          v-for="col in visibleColumns"
          :key="col.name"
          class="dw-er-table-node__col"
          :class="{ 'is-highlighted': col.highlighted }"
      >
        <Handle
            v-if="showHandles"
            class="dw-er-table-node__handle dw-er-table-node__handle--left"
            type="target"
            :position="Position.Left"
            :id="`in:${col.name}`"
        />
        <span class="dw-er-table-node__name">
          <span v-if="col.keyType" class="dw-er-table-node__key">{{ col.keyType }}</span>
          {{ col.name }}
        </span>
        <span v-if="col.dataType" class="dw-er-table-node__type">{{ col.dataType }}</span>
        <Handle
            v-if="showHandles"
            class="dw-er-table-node__handle dw-er-table-node__handle--right"
            type="source"
            :position="Position.Right"
            :id="`out:${col.name}`"
        />
      </li>
      <li v-if="hiddenCount > 0" class="dw-er-table-node__more">
        {{ moreLabel.replace('{n}', String(hiddenCount)) }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.dw-er-table-node {
  overflow: hidden;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-panel);
  box-shadow: 0 1px 3px color-mix(in srgb, var(--dw-text) 8%, transparent);
  font-size: var(--dw-text-xs);
}

.dw-er-table-node.is-accent {
  border-color: color-mix(in srgb, var(--dw-primary) 50%, var(--dw-border));
}

.dw-er-table-node.is-selected {
  border-color: var(--dw-primary);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--dw-primary) 35%, transparent);
}

.dw-er-table-node__head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--dw-border);
  background: linear-gradient(180deg, var(--dw-grid-chrome-top, var(--dw-bg-muted)) 0%, var(--dw-grid-chrome, var(--dw-bg-panel)) 100%);
}

.dw-er-table-node__role {
  color: var(--dw-text-muted);
  font-size: var(--dw-text-2xs);
  font-weight: 600;
}

.dw-er-table-node__title {
  color: var(--dw-text);
  font-size: var(--dw-text-sm);
  word-break: break-all;
}

.dw-er-table-node__cols {
  margin: 0;
  padding: 4px 0;
  list-style: none;
}

.dw-er-table-node__col {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: var(--dw-icon-size-xl);
  padding: 2px 12px;
}

.dw-er-table-node__col.is-highlighted {
  background: color-mix(in srgb, var(--dw-primary) 10%, transparent);
}

.dw-er-table-node__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dw-text);
}

.dw-er-table-node__key {
  margin-right: 4px;
  color: var(--dw-warning-fg);
  font-size: var(--dw-font-size-badge);
  font-weight: 700;
}

.dw-er-table-node__type {
  flex: 0 0 auto;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-2xs);
}

.dw-er-table-node__more {
  padding: 2px 12px 6px;
  color: var(--dw-text-muted);
}

.dw-er-table-node__handle {
  width: 7px !important;
  height: 7px !important;
  top: 50% !important;
  background: var(--dw-bg-panel) !important;
  border: 1px solid var(--dw-border) !important;
}

.dw-er-table-node__handle--left {
  left: -4px !important;
}

.dw-er-table-node__handle--right {
  right: -4px !important;
}
</style>
