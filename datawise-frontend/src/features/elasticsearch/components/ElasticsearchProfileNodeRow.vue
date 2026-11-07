<script setup lang="ts">
import {
    formatCostShare,
    formatProfileNanos,
    type ElasticsearchProfileNode,
} from '@/features/elasticsearch/services/elasticsearch-profile'

defineOptions({name: 'ElasticsearchProfileNodeRow'})

const props = defineProps<{
    node: ElasticsearchProfileNode
    path: string
    depth: number
    expanded: Set<string>
}>()

const emit = defineEmits<{ toggle: [key: string] }>()

function childPath(index: number): string {
    return `${props.path}.${index}`
}

function isOpen(): boolean {
    return props.path === 'root' || props.expanded.has(props.path)
}
</script>

<template>
  <li
      class="es-profile__row"
      :class="[
        node.isCriticalPath ? 'es-profile__row--critical' : '',
        `es-profile__row--${node.heatLevel}`,
      ]"
      :style="{paddingLeft: `${depth * 14}px`}"
  >
    <button
        v-if="node.children.length"
        type="button"
        class="es-profile__toggle"
        @click="emit('toggle', path)"
    >
      {{ isOpen() ? '▾' : '▸' }}
    </button>
    <span v-else class="es-profile__toggle es-profile__toggle--leaf">·</span>
    <span class="es-profile__type">{{ node.type }}</span>
    <span v-if="node.description" class="es-profile__desc" :title="node.description">{{ node.description }}</span>
    <span v-else class="es-profile__desc" />
    <span class="es-profile__time">{{ formatProfileNanos(node.timeInNanos) }}</span>
    <span class="es-profile__share">{{ formatCostShare(node.costShare) }}</span>
    <span class="es-profile__bar-fill" :style="{width: `${Math.max(2, Math.round(node.costShare * 100))}%`}" />
  </li>
  <template v-if="node.children.length && isOpen()">
    <ElasticsearchProfileNodeRow
        v-for="(child, index) in node.children"
        :key="childPath(index)"
        :node="child"
        :path="childPath(index)"
        :depth="depth + 1"
        :expanded="expanded"
        @toggle="emit('toggle', $event)"
    />
  </template>
</template>

<style scoped>
.es-profile__row {
  position: relative;
  display: grid;
  grid-template-columns: 18px minmax(80px, 160px) minmax(0, 1fr) 64px 40px;
  gap: 6px;
  align-items: center;
  padding: 3px 0;
}
.es-profile__row--critical .es-profile__type {
  font-weight: 600;
}
.es-profile__desc {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.75;
}
.es-profile__bar-fill {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2px;
  background: var(--dw-info);
  opacity: 0.55;
}
.es-profile__row--warm .es-profile__bar-fill { background: var(--dw-warning); }
.es-profile__row--hot .es-profile__bar-fill { background: var(--dw-danger); }
.es-profile__toggle {
  border: 1px solid var(--dw-border);
  background: transparent;
  border-radius: 4px;
  padding: 0 4px;
  font-size: var(--dw-text-sm);
  cursor: pointer;
}
.es-profile__toggle--leaf {
  border: none;
  cursor: default;
  opacity: 0.4;
}
</style>
