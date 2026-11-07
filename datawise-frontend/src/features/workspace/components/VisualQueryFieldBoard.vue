<script setup lang="ts">
import {ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {EmptyState} from '@/core/components'
import {parseVisualColumnKey} from '@/features/workspace/services/visual-query-builder.service'

const props = defineProps<{
    keys: string[]
}>()

const emit = defineEmits<{
    reorder: [fromIndex: number, toIndex: number]
    remove: [key: string]
    dropKey: [key: string, toIndex: number]
}>()

const {t} = useI18n()
const dragFromIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)
const boardDragOver = ref(false)

function labelFor(key: string): string {
    const parsed = parseVisualColumnKey(key)
    if (!parsed) return key
    return parsed.column === '*' ? `${parsed.tableAlias}.*` : `${parsed.tableAlias}.${parsed.column}`
}

function onChipDragStart(event: DragEvent, index: number) {
    dragFromIndex.value = index
    event.dataTransfer?.setData('text/vqb-selected-index', String(index))
    event.dataTransfer?.setData('text/plain', props.keys[index] ?? '')
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onChipDragEnd() {
    dragFromIndex.value = null
    dragOverIndex.value = null
}

function onChipDragOver(event: DragEvent, index: number) {
    event.preventDefault()
    dragOverIndex.value = index
    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = dragFromIndex.value != null ? 'move' : 'copy'
    }
}

function onChipDrop(event: DragEvent, index: number) {
    event.preventDefault()
    event.stopPropagation()
    const fromRaw = event.dataTransfer?.getData('text/vqb-selected-index')
    if (fromRaw !== '' && fromRaw != null) {
        const fromIndex = Number(fromRaw)
        if (Number.isFinite(fromIndex)) {
            emit('reorder', fromIndex, index)
        }
    } else {
        const key = (
            event.dataTransfer?.getData('text/vqb-column')
            || event.dataTransfer?.getData('text/plain')
            || ''
        ).trim()
        if (key) emit('dropKey', key, index)
    }
    dragFromIndex.value = null
    dragOverIndex.value = null
    boardDragOver.value = false
}

function onBoardDragOver(event: DragEvent) {
    event.preventDefault()
    boardDragOver.value = true
    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = dragFromIndex.value != null ? 'move' : 'copy'
    }
}

function onBoardDragLeave() {
    boardDragOver.value = false
}

function onBoardDrop(event: DragEvent) {
    event.preventDefault()
    boardDragOver.value = false
    const fromRaw = event.dataTransfer?.getData('text/vqb-selected-index')
    if (fromRaw !== '' && fromRaw != null) {
        const fromIndex = Number(fromRaw)
        if (Number.isFinite(fromIndex)) {
            emit('reorder', fromIndex, Math.max(0, props.keys.length - 1))
        }
        return
    }
    const key = (
        event.dataTransfer?.getData('text/vqb-column')
        || event.dataTransfer?.getData('text/plain')
        || ''
    ).trim()
    if (key) emit('dropKey', key, props.keys.length)
}
</script>

<template>
  <div
      class="vqb-field-board"
      :class="{ 'is-drag-over': boardDragOver }"
      @dragover="onBoardDragOver"
      @dragleave="onBoardDragLeave"
      @drop="onBoardDrop"
  >
    <header class="vqb-field-board__head">
      <strong>{{ t('console.visualQuery.fieldBoardTitle') }}</strong>
      <span>{{ t('console.visualQuery.fieldBoardHint') }}</span>
    </header>

    <div v-if="keys.length" class="vqb-field-board__list" role="list">
      <div
          v-for="(key, index) in keys"
          :key="key"
          class="vqb-field-board__chip"
          :class="{
            'is-dragging': dragFromIndex === index,
            'is-drop-target': dragOverIndex === index && dragFromIndex !== index,
          }"
          role="listitem"
          draggable="true"
          @dragstart="onChipDragStart($event, index)"
          @dragend="onChipDragEnd"
          @dragover="onChipDragOver($event, index)"
          @drop="onChipDrop($event, index)"
      >
        <span class="vqb-field-board__grip" aria-hidden="true">⋮⋮</span>
        <span class="vqb-field-board__label">{{ labelFor(key) }}</span>
        <button
            type="button"
            class="vqb-field-board__remove"
            :aria-label="t('console.visualQuery.removeField')"
            @click="emit('remove', key)"
        >
          ×
        </button>
      </div>
    </div>
    <EmptyState
        v-else
        embedded
        compact
        :title="t('console.visualQuery.fieldBoardEmpty')"
    />
  </div>
</template>

<style scoped>
.vqb-field-board {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-3);
  min-height: 160px;
  padding: var(--dw-space-3);
  border: var(--dw-border-width) dashed var(--dw-border);
  border-radius: var(--dw-control-radius);
  background: var(--dw-surface-muted);
}

.vqb-field-board.is-drag-over {
  border-color: var(--dw-primary);
  background: color-mix(in srgb, var(--dw-primary) 8%, var(--dw-surface-muted));
}

.vqb-field-board__head {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-1);
}

.vqb-field-board__head strong {
  font-size: var(--dw-text-sm);
  color: var(--dw-text);
}

.vqb-field-board__head span {
  margin: 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  line-height: var(--dw-leading);
}

.vqb-field-board__list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap-xs);
}

.vqb-field-board__chip {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-space-1);
  max-width: 100%;
  padding: var(--dw-space-1) var(--dw-space-2);
  border: var(--dw-border-width) solid var(--dw-border);
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-surface);
  cursor: grab;
  user-select: none;
}

.vqb-field-board__chip.is-dragging {
  opacity: 0.5;
}

.vqb-field-board__chip.is-drop-target {
  border-color: var(--dw-primary);
  box-shadow: inset 2px 0 0 var(--dw-primary);
}

.vqb-field-board__grip {
  flex-shrink: 0;
  letter-spacing: -0.12em;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  line-height: 1;
}

.vqb-field-board__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--dw-mono);
  font-size: var(--dw-text-xs);
  color: var(--dw-text);
}

.vqb-field-board__remove {
  flex-shrink: 0;
  margin: 0;
  padding: 0 var(--dw-space-1);
  border: none;
  background: transparent;
  color: var(--dw-text-muted);
  cursor: pointer;
  line-height: 1;
}

.vqb-field-board__remove:hover {
  color: var(--dw-danger);
}
</style>
