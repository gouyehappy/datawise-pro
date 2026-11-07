<script setup lang="ts">
import {computed, nextTick, onMounted, onUnmounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'
import DwSearchablePopup from '@/core/components/DwSearchablePopup.vue'
import type {ClauseColumnHint} from '@/core/data-grid/services/grid-clause-bar.service'
import {
  FILTER_BUILDER_OPERATORS,
  buildWhereFromFilterRules,
  countActiveFilterBuilderRules,
  createFilterBuilderRule,
  isFilterBuilderRuleComplete,
  operatorNeedsValue,
  type FilterBuilderOperator,
  type FilterBuilderRule,
} from '@/core/data-grid/services/grid-filter-builder.service'

const props = defineProps<{
  open: boolean
  columns: ClauseColumnHint[]
  anchorEl: HTMLElement | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  apply: [where: string, count: number]
  clear: []
}>()

const {t} = useI18n()

const panelRef = ref<HTMLElement | null>(null)
const bodyRef = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})
const rules = ref<FilterBuilderRule[]>([createFilterBuilderRule()])
const draggingId = ref<string | null>(null)
const dropTargetId = ref<string | null>(null)
const dropPosition = ref<'before' | 'after' | null>(null)

const columnOptions = computed(() =>
    props.columns.map((col) => ({
      value: col.name,
      label: col.name,
    })),
)

const operatorOptions = computed(() =>
    FILTER_BUILDER_OPERATORS.map((op) => ({
      value: op.value,
      label: t(`dataGrid.filterBuilder.operators.${op.value}`),
    })),
)

const activeCount = computed(() => countActiveFilterBuilderRules(rules.value))
const canApply = computed(() => activeCount.value > 0)
const canReorder = computed(() => rules.value.length > 1)

watch(
    () => props.open,
    (open) => {
      if (open) {
        if (!rules.value.length) rules.value = [createFilterBuilderRule()]
        void nextTick(() => updatePosition())
      }
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
  const width = Math.min(560, Math.max(420, window.innerWidth - 24))
  let left = rect.left
  if (left + width > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - width - 8)
  }
  let top = rect.bottom + 6
  const estimatedHeight = 280
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
  rules.value = [...rules.value, createFilterBuilderRule()]
}

function removeRule(id: string) {
  rules.value = rules.value.filter((rule) => rule.id !== id)
  if (!rules.value.length) rules.value = [createFilterBuilderRule()]
}

function updateRule(id: string, patch: Partial<FilterBuilderRule>) {
  const prev = rules.value.find((rule) => rule.id === id)
  rules.value = rules.value.map((rule) => {
    if (rule.id !== id) return rule
    const next = {...rule, ...patch}
    if (!operatorNeedsValue(next.operator)) next.value = ''
    return next
  })
  // After picking a column / operator that needs a value, jump to the value box.
  if (
      prev
      && (
          (patch.column != null && patch.column !== prev.column)
          || (patch.operator != null && patch.operator !== prev.operator)
      )
  ) {
    const next = rules.value.find((rule) => rule.id === id)
    if (next && operatorNeedsValue(next.operator)) {
      void nextTick(() => {
        const input = panelRef.value?.querySelector(
            `input.grid-filter-builder__value[data-rule-id="${id}"]`,
        ) as HTMLInputElement | null
        input?.focus()
        input?.select()
      })
    }
  }
}

function resetRules() {
  rules.value = [createFilterBuilderRule()]
}

function clearAll() {
  rules.value = [createFilterBuilderRule()]
  emit('clear')
  close()
}

function apply() {
  const where = buildWhereFromFilterRules(rules.value)
  emit('apply', where, countActiveFilterBuilderRules(rules.value))
  close()
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
  const rows = [...bodyRef.value.querySelectorAll<HTMLElement>('[data-filter-rule]')]
  const others = rows.filter((row) => row.dataset.filterRule !== id)
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
      dropTargetId.value = row.dataset.filterRule ?? null
      dropPosition.value = 'before'
      return
    }
  }
  const last = others[others.length - 1]!
  dropTargetId.value = last.dataset.filterRule ?? null
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

function onDocPointerDown(event: PointerEvent) {
  if (!props.open) return
  const target = event.target
  if (!(target instanceof Node)) return
  if (panelRef.value?.contains(target)) return
  if (props.anchorEl?.contains(target)) return
  // DwSearchablePopup panels teleported to body
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

defineExpose({
  activeCount,
  rules,
  setRules(next: FilterBuilderRule[]) {
    rules.value = next.length ? next.map((r) => ({...r})) : [createFilterBuilderRule()]
  },
  resetRules,
})
</script>

<template>
  <Teleport to="body">
    <div
        v-if="open"
        ref="panelRef"
        class="grid-filter-builder"
        role="dialog"
        :aria-label="t('dataGrid.filterBuilder.title')"
        :style="panelStyle"
        @keydown.escape.prevent="close"
    >
      <header class="grid-filter-builder__header">
        <span class="grid-filter-builder__title">{{ t('dataGrid.filterBuilder.title') }}</span>
        <button
            type="button"
            class="grid-filter-builder__text-btn"
            :title="t('dataGrid.filterBuilder.clear')"
            @click="clearAll"
        >
          <DwIcon name="delete" size="xs" :stroke-width="1.6"/>
          {{ t('dataGrid.filterBuilder.clear') }}
        </button>
      </header>

      <div ref="bodyRef" class="grid-filter-builder__body">
        <div
            v-for="(rule, index) in rules"
            :key="rule.id"
            class="grid-filter-builder__row"
            :class="{ 'is-follow': index > 0 }"
            :data-filter-rule="rule.id"
            :data-dragging="draggingId === rule.id ? '' : undefined"
            :data-drop-position="dropTargetId === rule.id ? dropPosition ?? undefined : undefined"
        >
          <button
              type="button"
              class="grid-filter-builder__drag"
              :disabled="!canReorder"
              :title="t('dataGrid.filterBuilder.reorder')"
              :aria-label="t('dataGrid.filterBuilder.reorder')"
              @pointerdown="startDrag($event, rule.id)"
          >
            <DwIcon name="grip-vertical" size="xs" :stroke-width="1.8"/>
          </button>

          <select
              v-if="index > 0"
              class="grid-filter-builder__conj"
              :value="rule.conjunction"
              :aria-label="t('dataGrid.filterBuilder.conjunction')"
              @change="updateRule(rule.id, {conjunction: ($event.target as HTMLSelectElement).value as 'AND' | 'OR'})"
          >
            <option value="AND">AND</option>
            <option value="OR">OR</option>
          </select>

          <DwSearchablePopup
              :model-value="rule.column"
              class="grid-filter-builder__col"
              variant="cell"
              allow-custom
              :options="columnOptions"
              :placeholder="t('dataGrid.filterBuilder.column')"
              :search-placeholder="t('dataGrid.filterBuilder.searchColumns')"
              :empty-text="t('dataGrid.filterBuilder.noColumns')"
              :menu-min-width="200"
              @update:model-value="updateRule(rule.id, {column: $event})"
          />

          <DwSearchablePopup
              :model-value="rule.operator"
              class="grid-filter-builder__op"
              variant="cell"
              :allow-custom="false"
              :options="operatorOptions"
              :placeholder="t('dataGrid.filterBuilder.operator')"
              :search-placeholder="t('dataGrid.filterBuilder.searchOperators')"
              :empty-text="t('dataGrid.filterBuilder.noOperators')"
              :menu-min-width="160"
              @update:model-value="updateRule(rule.id, {operator: $event as FilterBuilderOperator})"
          />

          <input
              v-if="operatorNeedsValue(rule.operator)"
              class="grid-filter-builder__value"
              type="text"
              :data-rule-id="rule.id"
              :value="rule.value"
              :placeholder="t('dataGrid.filterBuilder.value')"
              spellcheck="false"
              @input="updateRule(rule.id, {value: ($event.target as HTMLInputElement).value})"
              @keydown.enter.prevent="isFilterBuilderRuleComplete(rule) && apply()"
          >

          <span
              v-else
              class="grid-filter-builder__value grid-filter-builder__value--empty"
          >
            {{ t('dataGrid.filterBuilder.noValue') }}
          </span>

          <button
              type="button"
              class="grid-filter-builder__icon-btn"
              :title="t('dataGrid.filterBuilder.removeRule')"
              :disabled="rules.length <= 1 && !rule.column && !rule.value"
              @click="removeRule(rule.id)"
          >
            <DwIcon name="x" size="xs" :stroke-width="1.8"/>
          </button>
        </div>
      </div>

      <footer class="grid-filter-builder__footer">
        <button
            type="button"
            class="grid-filter-builder__ghost"
            @click="addRule"
        >
          <DwIcon name="plus" size="xs" :stroke-width="1.8"/>
          {{ t('dataGrid.filterBuilder.addRule') }}
        </button>
        <div class="grid-filter-builder__footer-actions">
          <button type="button" class="grid-filter-builder__ghost" @click="resetRules">
            {{ t('dataGrid.filterBuilder.reset') }}
          </button>
          <button
              type="button"
              class="grid-filter-builder__primary"
              :disabled="!canApply"
              @click="apply"
          >
            {{ t('dataGrid.filterBuilder.apply') }}
          </button>
        </div>
      </footer>
    </div>
  </Teleport>
</template>

<style scoped>
.grid-filter-builder {
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

.grid-filter-builder__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap);
  min-height: var(--dw-control-h-sm);
}

.grid-filter-builder__title {
  font-size: var(--dw-text-sm);
  font-weight: 600;
}

.grid-filter-builder__text-btn {
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

.grid-filter-builder__text-btn:hover {
  color: var(--dw-danger);
  background: color-mix(in srgb, var(--dw-danger) 8%, transparent);
}

.grid-filter-builder__body {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-2);
  max-height: min(360px, 50vh);
  overflow: auto;
}

.grid-filter-builder__row {
  position: relative;
  display: grid;
  /* First rule: drag | field | op | value | x — no AND/OR spacer */
  grid-template-columns: 18px minmax(96px, 1.2fr) minmax(88px, 0.9fr) minmax(120px, 1.4fr) auto;
  align-items: center;
  gap: var(--dw-space-2);
}

.grid-filter-builder__row.is-follow {
  grid-template-columns: 18px 52px minmax(96px, 1.2fr) minmax(88px, 0.9fr) minmax(120px, 1.4fr) auto;
}

.grid-filter-builder__row[data-dragging] {
  opacity: 0.45;
}

.grid-filter-builder__row[data-drop-position]::before {
  position: absolute;
  z-index: 2;
  right: 0;
  left: 0;
  height: 2px;
  background: var(--dw-primary);
  content: '';
  pointer-events: none;
}

.grid-filter-builder__row[data-drop-position='before']::before {
  top: -1px;
}

.grid-filter-builder__row[data-drop-position='after']::before {
  bottom: -1px;
}

.grid-filter-builder__drag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: var(--dw-control-h-sm);
  padding: 0;
  border: none;
  border-radius: var(--dw-control-radius-sm);
  background: transparent;
  color: var(--dw-text-muted);
  cursor: grab;
  touch-action: none;
}

.grid-filter-builder__drag:active:not(:disabled) {
  cursor: grabbing;
}

.grid-filter-builder__drag:hover:not(:disabled) {
  color: var(--dw-text-primary);
  background: color-mix(in srgb, var(--dw-bg-muted) 50%, transparent);
}

.grid-filter-builder__drag:disabled {
  opacity: 0.3;
  cursor: default;
}

.grid-filter-builder__conj,
.grid-filter-builder__value {
  height: var(--dw-control-h-sm);
  min-width: 0;
  padding: 0 var(--dw-space-2);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg-input, var(--dw-bg));
  color: var(--dw-text-primary);
  font-size: var(--dw-text-sm);
}

.grid-filter-builder__conj {
  font-family: var(--dw-mono);
  font-size: var(--dw-text-xs);
}

.grid-filter-builder__value--empty {
  display: flex;
  align-items: center;
  border-style: dashed;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
}

.grid-filter-builder__col,
.grid-filter-builder__op {
  min-width: 0;
}

.grid-filter-builder__col :deep(.dw-sp__trigger),
.grid-filter-builder__op :deep(.dw-sp__trigger) {
  height: var(--dw-control-h-sm);
  min-height: var(--dw-control-h-sm);
  padding: 0 var(--dw-space-2);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg-input, var(--dw-bg));
}

.grid-filter-builder__icon-btn {
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

.grid-filter-builder__icon-btn:hover:not(:disabled) {
  color: var(--dw-text-primary);
  background: color-mix(in srgb, var(--dw-bg-muted) 50%, transparent);
}

.grid-filter-builder__icon-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.grid-filter-builder__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap);
  padding-top: var(--dw-space-1);
  border-top: 1px solid color-mix(in srgb, var(--dw-border-light) 70%, transparent);
}

.grid-filter-builder__footer-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-space-2);
}

.grid-filter-builder__ghost,
.grid-filter-builder__primary {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: var(--dw-control-h-sm);
  padding: 0 var(--dw-space-3);
  border-radius: var(--dw-control-radius-sm);
  font-size: var(--dw-text-xs);
  cursor: pointer;
}

.grid-filter-builder__ghost {
  border: 1px solid transparent;
  background: transparent;
  color: var(--dw-text-secondary);
}

.grid-filter-builder__ghost:hover {
  background: color-mix(in srgb, var(--dw-bg-muted) 45%, transparent);
}

.grid-filter-builder__primary {
  border: none;
  background: var(--dw-primary);
  color: #fff;
  font-weight: 600;
}

.grid-filter-builder__primary:hover:not(:disabled) {
  filter: brightness(1.05);
}

.grid-filter-builder__primary:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
