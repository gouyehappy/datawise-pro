<script setup lang="ts">
import {computed, nextTick, onMounted, onUnmounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'
import DwSearchablePopup from '@/core/components/DwSearchablePopup.vue'
import type {ClauseColumnHint} from '@/core/data-grid/services/grid-clause-bar.service'
import {
  formatOrderClauses,
  parseOrderClauses,
} from '@/core/data-grid/services/grid-clause-bar.service'

type SortRule = {
  id: string
  column: string
  direction: 'asc' | 'desc'
}

const props = defineProps<{
  open: boolean
  columns: ClauseColumnHint[]
  anchorEl: HTMLElement | null
  currentOrder?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  apply: [order: string, count: number]
  clear: []
}>()

const {t} = useI18n()

const panelRef = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})
let ruleSeq = 0

function createRule(patch?: Partial<Omit<SortRule, 'id'>>): SortRule {
  ruleSeq += 1
  return {
    id: `sr-${Date.now().toString(36)}-${ruleSeq}`,
    column: '',
    direction: 'asc',
    ...patch,
  }
}

const rules = ref<SortRule[]>([createRule()])
const bodyRef = ref<HTMLElement | null>(null)
const draggingId = ref<string | null>(null)
const dropTargetId = ref<string | null>(null)
const dropPosition = ref<'before' | 'after' | null>(null)

const columnOptions = computed(() =>
    props.columns.map((col) => ({value: col.name, label: col.name})),
)

const directionOptions = computed(() => [
  {value: 'asc', label: 'ASC'},
  {value: 'desc', label: 'DESC'},
])

const activeCount = computed(() => rules.value.filter((rule) => rule.column.trim()).length)
const hasIncomplete = computed(() =>
    rules.value.some((rule) => !rule.column.trim()),
)
const canApply = computed(() => activeCount.value > 0 && !hasIncomplete.value)
const canReorder = computed(() => rules.value.length > 1)

watch(
    () => props.open,
    (open) => {
      if (!open) return
      const parsed = parseOrderClauses(props.currentOrder ?? '')
      if (parsed && parsed.length) {
        rules.value = parsed.map((item) =>
            createRule({column: item.column, direction: item.direction}),
        )
      } else if (!rules.value.length) {
        rules.value = [createRule()]
      }
      void nextTick(() => updatePosition())
    },
)

watch(
    () => props.anchorEl,
    () => {
      if (props.open) updatePosition()
    },
)

function updatePosition() {
  const anchor = props.anchorEl
  if (!anchor) {
    panelStyle.value = {}
    return
  }
  const rect = anchor.getBoundingClientRect()
  const width = Math.min(480, Math.max(360, window.innerWidth - 24))
  let left = rect.left
  if (left + width > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - width - 8)
  }
  let top = rect.bottom + 6
  const estimatedHeight = 260
  if (top + estimatedHeight > window.innerHeight - 8) {
    top = Math.max(8, rect.top - estimatedHeight - 6)
  }
  panelStyle.value = {
    position: 'fixed',
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    width: `${Math.round(width)}px`,
    zIndex: 'var(--dw-z-popover)',
  }
}

function close() {
  emit('update:open', false)
}

function addRule() {
  rules.value = [...rules.value, createRule()]
  void nextTick(() => updatePosition())
}

function removeRule(id: string) {
  rules.value = rules.value.filter((rule) => rule.id !== id)
  if (!rules.value.length) rules.value = [createRule()]
}

function updateRule(id: string, patch: Partial<SortRule>) {
  rules.value = rules.value.map((rule) => (rule.id === id ? {...rule, ...patch} : rule))
}

function moveRuleToIndex(id: string, targetIndex: number) {
  const sourceIndex = rules.value.findIndex((rule) => rule.id === id)
  if (sourceIndex < 0) return
  const nextIndex = Math.min(rules.value.length - 1, Math.max(0, targetIndex))
  if (sourceIndex === nextIndex) return
  const next = [...rules.value]
  const [item] = next.splice(sourceIndex, 1)
  next.splice(nextIndex, 0, item!)
  rules.value = next
}

function clearDragState() {
  draggingId.value = null
  dropTargetId.value = null
  dropPosition.value = null
  window.removeEventListener('pointermove', onDragMove, true)
  window.removeEventListener('pointerup', onDragEnd, true)
  window.removeEventListener('pointercancel', onDragEnd, true)
  window.removeEventListener('keydown', onDragKeydown, true)
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
}

function updateDropFromPointer(clientY: number) {
  const id = draggingId.value
  if (!id || !bodyRef.value) return
  const rows = [...bodyRef.value.querySelectorAll<HTMLElement>('[data-sort-rule]')]
  const others = rows.filter((row) => row.dataset.sortRule !== id)
  if (!others.length) {
    dropTargetId.value = null
    dropPosition.value = null
    return
  }
  for (let i = 0; i < others.length; i++) {
    const row = others[i]!
    const rect = row.getBoundingClientRect()
    const mid = rect.top + rect.height / 2
    if (clientY < mid) {
      dropTargetId.value = row.dataset.sortRule ?? null
      dropPosition.value = 'before'
      return
    }
  }
  const last = others[others.length - 1]!
  dropTargetId.value = last.dataset.sortRule ?? null
  dropPosition.value = 'after'
}

function onDragMove(event: PointerEvent) {
  if (!draggingId.value) return
  event.preventDefault()
  updateDropFromPointer(event.clientY)
}

function onDragEnd() {
  const id = draggingId.value
  const targetId = dropTargetId.value
  const position = dropPosition.value
  if (id && targetId && position) {
    const targetIndex = rules.value.findIndex((rule) => rule.id === targetId)
    if (targetIndex >= 0) {
      const sourceIndex = rules.value.findIndex((rule) => rule.id === id)
      let nextIndex = position === 'before' ? targetIndex : targetIndex + 1
      if (sourceIndex >= 0 && sourceIndex < nextIndex) nextIndex -= 1
      moveRuleToIndex(id, nextIndex)
    }
  }
  clearDragState()
}

function onDragKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && draggingId.value) {
    event.preventDefault()
    clearDragState()
  }
}

function startDrag(event: PointerEvent, id: string) {
  if (!canReorder.value || event.button !== 0) return
  event.preventDefault()
  event.stopPropagation()
  draggingId.value = id
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'grabbing'
  updateDropFromPointer(event.clientY)
  window.addEventListener('pointermove', onDragMove, true)
  window.addEventListener('pointerup', onDragEnd, true)
  window.addEventListener('pointercancel', onDragEnd, true)
  window.addEventListener('keydown', onDragKeydown, true)
}

function resetRules() {
  rules.value = [createRule()]
}

function clearAll() {
  rules.value = [createRule()]
  emit('clear')
  close()
}

function apply() {
  if (hasIncomplete.value) return
  const specs = rules.value
      .filter((rule) => rule.column.trim())
      .map((rule) => ({column: rule.column.trim(), direction: rule.direction}))
  const order = formatOrderClauses(specs)
  emit('apply', order, specs.length)
  close()
}

function onDocPointerDown(event: PointerEvent) {
  if (!props.open) return
  const target = event.target
  if (!(target instanceof Node)) return
  if (panelRef.value?.contains(target)) return
  if (props.anchorEl?.contains(target)) return
  if (target instanceof Element && target.closest('.dw-sp__panel')) return
  close()
}

function onViewportChange() {
  if (props.open) updatePosition()
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown, true)
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('scroll', onViewportChange, true)
})

onUnmounted(() => {
  clearDragState()
  document.removeEventListener('pointerdown', onDocPointerDown, true)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onViewportChange, true)
})

defineExpose({activeCount, resetRules})
</script>

<template>
  <Teleport to="body">
    <div
        v-if="open"
        ref="panelRef"
        class="grid-order-builder"
        role="dialog"
        :aria-label="t('dataGrid.orderBuilder.title')"
        :style="panelStyle"
        @keydown.escape.prevent="close"
    >
      <header class="grid-order-builder__header">
        <span class="grid-order-builder__title">{{ t('dataGrid.orderBuilder.title') }}</span>
        <button
            type="button"
            class="grid-order-builder__text-btn"
            :title="t('dataGrid.orderBuilder.clear')"
            @click="clearAll"
        >
          <DwIcon name="delete" size="xs" :stroke-width="1.6"/>
          {{ t('dataGrid.orderBuilder.clear') }}
        </button>
      </header>

      <div ref="bodyRef" class="grid-order-builder__body">
        <div
            v-for="rule in rules"
            :key="rule.id"
            class="grid-order-builder__row"
            :data-sort-rule="rule.id"
            :data-dragging="draggingId === rule.id ? '' : undefined"
            :data-drop-position="dropTargetId === rule.id ? dropPosition ?? undefined : undefined"
        >
          <button
              type="button"
              class="grid-order-builder__drag"
              :disabled="!canReorder"
              :title="t('dataGrid.orderBuilder.reorder')"
              :aria-label="t('dataGrid.orderBuilder.reorder')"
              @pointerdown="startDrag($event, rule.id)"
          >
            <DwIcon name="grip-vertical" size="xs" :stroke-width="1.8"/>
          </button>

          <DwSearchablePopup
              :model-value="rule.column"
              class="grid-order-builder__col"
              variant="cell"
              allow-custom
              :options="columnOptions"
              :placeholder="t('dataGrid.orderBuilder.column')"
              :search-placeholder="t('dataGrid.filterBuilder.searchColumns')"
              :empty-text="t('dataGrid.filterBuilder.noColumns')"
              :menu-min-width="200"
              @update:model-value="updateRule(rule.id, {column: $event})"
          />

          <DwSearchablePopup
              :model-value="rule.direction"
              class="grid-order-builder__dir"
              variant="cell"
              :allow-custom="false"
              :options="directionOptions"
              :menu-min-width="100"
              @update:model-value="updateRule(rule.id, {direction: $event as 'asc' | 'desc'})"
          />

          <button
              type="button"
              class="grid-order-builder__icon-btn"
              :title="t('dataGrid.orderBuilder.removeRule')"
              :disabled="rules.length <= 1 && !rule.column"
              @click="removeRule(rule.id)"
          >
            <DwIcon name="x" size="xs" :stroke-width="1.8"/>
          </button>
        </div>
      </div>

      <footer class="grid-order-builder__footer">
        <button type="button" class="grid-order-builder__ghost" @click="addRule">
          <DwIcon name="plus" size="xs" :stroke-width="1.8"/>
          {{ t('dataGrid.orderBuilder.addRule') }}
        </button>
        <div class="grid-order-builder__footer-actions">
          <button type="button" class="grid-order-builder__ghost" @click="resetRules">
            {{ t('dataGrid.orderBuilder.reset') }}
          </button>
          <button
              type="button"
              class="grid-order-builder__primary"
              :disabled="!canApply"
              @click="apply"
          >
            {{ t('dataGrid.orderBuilder.apply') }}
          </button>
        </div>
      </footer>
    </div>
  </Teleport>
</template>

<style scoped>
.grid-order-builder {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-2);
  padding: var(--dw-space-3);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-panel);
  box-shadow: var(--dw-menu-shadow);
  color: var(--dw-text-primary);
}

.grid-order-builder__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap);
}

.grid-order-builder__title {
  font-size: var(--dw-text-sm);
  font-weight: 600;
}

.grid-order-builder__text-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: var(--dw-control-h-sm);
  padding: 0 var(--dw-space-2);
  border: none;
  border-radius: var(--dw-control-radius-sm);
  background: transparent;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  cursor: pointer;
}

.grid-order-builder__text-btn:hover {
  color: var(--dw-danger);
  background: color-mix(in srgb, var(--dw-danger) 8%, transparent);
}

.grid-order-builder__body {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-2);
  max-height: min(320px, 45vh);
  overflow: auto;
}

.grid-order-builder__row {
  position: relative;
  display: grid;
  grid-template-columns: 18px minmax(140px, 1fr) 88px auto;
  align-items: center;
  gap: var(--dw-space-2);
}

.grid-order-builder__row[data-dragging] {
  opacity: 0.45;
}

.grid-order-builder__row[data-drop-position]::before {
  position: absolute;
  z-index: 2;
  right: 0;
  left: 0;
  height: 2px;
  background: var(--dw-primary);
  content: '';
  pointer-events: none;
}

.grid-order-builder__row[data-drop-position='before']::before {
  top: -1px;
}

.grid-order-builder__row[data-drop-position='after']::before {
  bottom: -1px;
}

.grid-order-builder__col,
.grid-order-builder__dir {
  min-width: 0;
}

.grid-order-builder__col :deep(.dw-sp__trigger),
.grid-order-builder__dir :deep(.dw-sp__trigger) {
  height: var(--dw-control-h-sm);
  min-height: var(--dw-control-h-sm);
  padding: 0 var(--dw-space-2);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg-input, var(--dw-bg));
}

.grid-order-builder__drag,
.grid-order-builder__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--dw-control-h-sm);
  height: var(--dw-control-h-sm);
  padding: 0;
  border: none;
  border-radius: var(--dw-control-radius-sm);
  background: transparent;
  color: var(--dw-text-muted);
  cursor: pointer;
}

.grid-order-builder__drag {
  width: 18px;
  cursor: grab;
  touch-action: none;
}

.grid-order-builder__drag:active:not(:disabled) {
  cursor: grabbing;
}

.grid-order-builder__drag:hover:not(:disabled),
.grid-order-builder__icon-btn:hover:not(:disabled) {
  color: var(--dw-text-primary);
  background: color-mix(in srgb, var(--dw-bg-muted) 50%, transparent);
}

.grid-order-builder__drag:disabled,
.grid-order-builder__icon-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.grid-order-builder__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap);
  padding-top: var(--dw-space-1);
  border-top: 1px solid color-mix(in srgb, var(--dw-border-light) 70%, transparent);
}

.grid-order-builder__footer-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-space-2);
}

.grid-order-builder__ghost,
.grid-order-builder__primary {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: var(--dw-control-h-sm);
  padding: 0 var(--dw-space-3);
  border-radius: var(--dw-control-radius-sm);
  font-size: var(--dw-text-xs);
  cursor: pointer;
}

.grid-order-builder__ghost {
  border: 1px solid transparent;
  background: transparent;
  color: var(--dw-text-secondary);
}

.grid-order-builder__ghost:hover {
  background: color-mix(in srgb, var(--dw-bg-muted) 45%, transparent);
}

.grid-order-builder__primary {
  border: none;
  background: var(--dw-primary);
  color: #fff;
  font-weight: 600;
}

.grid-order-builder__primary:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
