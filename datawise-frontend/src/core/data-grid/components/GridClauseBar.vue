<script setup lang="ts">
import {computed, nextTick, onMounted, onUnmounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'
import {
  suggestClauseColumns,
  type ClauseColumnHint,
} from '@/core/data-grid/services/grid-clause-bar.service'
import GridFilterBuilderPopover from '@/core/data-grid/components/GridFilterBuilderPopover.vue'
import GridOrderBuilderPopover from '@/core/data-grid/components/GridOrderBuilderPopover.vue'

const props = defineProps<{
  columns: ClauseColumnHint[]
  whereInvalid?: boolean
  orderInvalid?: boolean
}>()

const whereModel = defineModel<string>('where', {default: ''})
const orderModel = defineModel<string>('order', {default: ''})

const emit = defineEmits<{
  apply: []
  'focus-change': [focused: boolean]
}>()

const {t} = useI18n()

const rootRef = ref<HTMLElement | null>(null)
const whereRef = ref<HTMLInputElement | null>(null)
const orderRef = ref<HTMLInputElement | null>(null)
const suggestRef = ref<HTMLElement | null>(null)
const whereChipRef = ref<HTMLElement | null>(null)
const orderChipRef = ref<HTMLElement | null>(null)
const filterBuilderRef = ref<InstanceType<typeof GridFilterBuilderPopover> | null>(null)
const filterBuilderOpen = ref(false)
const orderBuilderOpen = ref(false)
/** Badge count after applying builder rules (0 when WHERE cleared / typed manually). */
const filterBadgeCount = ref(0)
const orderBadgeCount = ref(0)
const orderBadgeLabel = computed(() => {
  const n = orderBadgeCount.value
  if (n <= 0) return ''
  return n > 99 ? '99+' : String(n)
})
const activeField = ref<'where' | 'order' | null>(null)
/** 仅在用户实际输入后才允许弹出提示，避免 focus 即出全量列表 */
const suggestEnabled = ref(false)
const suggestIndex = ref(0)
const suggestTick = ref(0)
const suggestStyle = ref<Record<string, string>>({})

const hasActive = computed(() => Boolean(whereModel.value.trim() || orderModel.value.trim()))
const filterBadgeLabel = computed(() => {
  const n = filterBadgeCount.value
  if (n <= 0) return ''
  return n > 99 ? '99+' : String(n)
})

const activeInput = computed(() => {
  if (activeField.value === 'where') return whereRef.value
  if (activeField.value === 'order') return orderRef.value
  return null
})

const suggestions = computed(() => {
  suggestTick.value
  if (!activeField.value || !suggestEnabled.value) return [] as ClauseColumnHint[]
  const el = activeInput.value
  const value = activeField.value === 'where' ? whereModel.value : orderModel.value
  if (!value.trim()) return [] as ClauseColumnHint[]
  const caret = el?.selectionStart ?? value.length
  return suggestClauseColumns(props.columns, value, caret, activeField.value).suggestions
})

const showSuggest = computed(() => activeField.value != null && suggestions.value.length > 0)

watch(suggestions, () => {
  suggestIndex.value = 0
})

watch(activeField, (field) => {
  emit('focus-change', field != null)
  if (!field) {
    suggestEnabled.value = false
    suggestStyle.value = {}
  }
})

watch(showSuggest, (open) => {
  if (open) {
    void nextTick(() => updateSuggestPosition())
  } else {
    suggestStyle.value = {}
  }
})

function focusField(field: 'where' | 'order') {
  activeField.value = field
  // 聚焦本身不开启提示；等 input 事件
  suggestEnabled.value = false
}

function blurField() {
  window.setTimeout(() => {
    const active = document.activeElement
    if (suggestRef.value?.contains(active)) return
    if (rootRef.value?.contains(active)) return
    activeField.value = null
    suggestEnabled.value = false
  }, 120)
}

function onInput() {
  suggestEnabled.value = true
  suggestTick.value += 1
  void nextTick(() => updateSuggestPosition())
}

function updateSuggestPosition() {
  const el = activeInput.value
  if (!el || !showSuggest.value) {
    suggestStyle.value = {}
    return
  }
  const rect = el.getBoundingClientRect()
  const menuWidth = Math.min(360, Math.max(240, rect.width + 48))
  let left = rect.left
  if (left + menuWidth > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - menuWidth - 8)
  }
  suggestStyle.value = {
    position: 'fixed',
    top: `${Math.round(rect.bottom + 4)}px`,
    left: `${Math.round(left)}px`,
    width: `${Math.round(menuWidth)}px`,
    zIndex: 'var(--dw-z-dropdown)',
  }
}

function applySuggestion(hint: ClauseColumnHint) {
  const field = activeField.value
  if (!field) return
  const name = hint.name
  if (field === 'where') {
    const current = whereModel.value
    const caret = whereRef.value?.selectionStart ?? current.length
    const before = current.slice(0, caret)
    const after = current.slice(caret)
    const prefix = before.replace(/[A-Za-z_][\w$]*$/, '')
    whereModel.value = `${prefix}${name}${after}`
    void nextTick(() => {
      const el = whereRef.value
      if (!el) return
      const pos = (prefix + name).length
      el.focus()
      el.setSelectionRange(pos, pos)
      suggestEnabled.value = false
      suggestTick.value += 1
    })
  } else {
    const current = orderModel.value
    const dir = current.match(/\s+(asc|desc)\s*$/i)?.[0] ?? ''
    orderModel.value = `${name}${dir}`
    void nextTick(() => {
      orderRef.value?.focus()
      orderRef.value?.setSelectionRange(name.length, name.length)
      suggestEnabled.value = false
      activeField.value = null
    })
  }
}

function onKeydown(event: KeyboardEvent, field: 'where' | 'order') {
  if (showSuggest.value) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      suggestIndex.value = (suggestIndex.value + 1) % suggestions.value.length
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      suggestIndex.value =
          (suggestIndex.value - 1 + suggestions.value.length) % suggestions.value.length
      return
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      const pick = suggestions.value[suggestIndex.value]
      if (pick) {
        event.preventDefault()
        activeField.value = field
        applySuggestion(pick)
        return
      }
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      suggestEnabled.value = false
      return
    }
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    suggestEnabled.value = false
    activeField.value = null
    emit('apply')
  }
}

function clearWhere() {
  whereModel.value = ''
  filterBadgeCount.value = 0
  filterBuilderRef.value?.resetRules()
  suggestEnabled.value = false
  emit('apply')
}

function toggleFilterBuilder(event?: Event) {
  event?.preventDefault()
  event?.stopPropagation()
  suggestEnabled.value = false
  activeField.value = null
  orderBuilderOpen.value = false
  filterBuilderOpen.value = !filterBuilderOpen.value
}

function toggleOrderBuilder(event?: Event) {
  event?.preventDefault()
  event?.stopPropagation()
  suggestEnabled.value = false
  activeField.value = null
  filterBuilderOpen.value = false
  orderBuilderOpen.value = !orderBuilderOpen.value
}

function onFilterBuilderApply(where: string, count: number) {
  whereModel.value = where
  filterBadgeCount.value = where.trim() ? count : 0
  emit('apply')
}

function onFilterBuilderClear() {
  whereModel.value = ''
  filterBadgeCount.value = 0
  emit('apply')
}

function onOrderBuilderApply(order: string, count: number) {
  orderModel.value = order
  orderBadgeCount.value = order.trim() ? count : 0
  emit('apply')
}

function onOrderBuilderClear() {
  orderModel.value = ''
  orderBadgeCount.value = 0
  emit('apply')
}

watch(whereModel, (value) => {
  if (!value.trim()) {
    filterBadgeCount.value = 0
    return
  }
  // Keep a minimal badge when WHERE was typed / restored without the builder.
  if (filterBadgeCount.value <= 0) filterBadgeCount.value = 1
})

watch(orderModel, (value) => {
  if (!value.trim()) {
    orderBadgeCount.value = 0
    return
  }
  if (orderBadgeCount.value <= 0) {
    const parts = value.split(',').map((part) => part.trim()).filter(Boolean)
    orderBadgeCount.value = Math.max(1, parts.length)
  }
})

function clearOrder() {
  orderModel.value = ''
  orderBadgeCount.value = 0
  suggestEnabled.value = false
  emit('apply')
}

function onDocPointerDown(event: PointerEvent) {
  const target = event.target
  if (!(target instanceof Node)) return
  if (suggestRef.value?.contains(target)) return
  if (filterBuilderOpen.value || orderBuilderOpen.value) return
  if (rootRef.value && !rootRef.value.contains(target)) {
    activeField.value = null
    suggestEnabled.value = false
  }
}

watch([filterBuilderOpen, orderBuilderOpen], ([filterOpen, orderOpen]) => {
  emit('focus-change', filterOpen || orderOpen || activeField.value != null)
})

function onViewportChange() {
  if (showSuggest.value) updateSuggestPosition()
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown, true)
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('scroll', onViewportChange, true)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onViewportChange, true)
})
</script>

<template>
  <div
      ref="rootRef"
      class="grid-clause-bar"
      role="search"
      :class="{
        'is-active': hasActive,
        'is-focused': activeField != null,
        'is-where-focused': activeField === 'where',
        'is-order-focused': activeField === 'order',
        'is-where-invalid': whereInvalid,
        'is-order-invalid': orderInvalid,
      }"
  >
    <div class="grid-clause-bar__pane grid-clause-bar__pane--where">
      <span ref="whereChipRef" class="grid-clause-bar__chip">
        <button
            type="button"
            class="grid-clause-bar__filter-btn"
            :class="{ 'is-open': filterBuilderOpen, 'has-badge': filterBadgeCount > 0 }"
            :title="t('dataGrid.filterBuilder.open')"
            :aria-label="t('dataGrid.filterBuilder.open')"
            :aria-expanded="filterBuilderOpen"
            @click="toggleFilterBuilder"
        >
          <DwIcon name="filter" size="xs" :stroke-width="1.6"/>
          <span
              v-if="filterBadgeLabel"
              class="grid-clause-bar__filter-badge"
          >{{ filterBadgeLabel }}</span>
        </button>
        <span class="grid-clause-bar__label" aria-hidden="true">WHERE</span>
      </span>
      <div class="grid-clause-bar__field">
        <input
            ref="whereRef"
            v-model="whereModel"
            class="grid-clause-bar__input"
            type="text"
            spellcheck="false"
            autocomplete="off"
            :aria-label="t('dataGrid.clauseBar.whereLabel')"
            :aria-invalid="whereInvalid ? 'true' : undefined"
            :title="whereInvalid ? t('dataGrid.clauseBar.whereInvalid') : undefined"
            @focus="focusField('where')"
            @blur="blurField"
            @input="onInput"
            @keydown="onKeydown($event, 'where')"
        >
        <button
            v-if="whereModel.trim()"
            type="button"
            class="grid-clause-bar__clear"
            :title="t('dataGrid.clearFilterInput')"
            @mousedown.prevent
            @click="clearWhere"
        >
          <DwIcon name="x" size="xs" :stroke-width="1.6"/>
        </button>
      </div>
    </div>

    <div class="grid-clause-bar__pane grid-clause-bar__pane--order">
      <span ref="orderChipRef" class="grid-clause-bar__chip grid-clause-bar__chip--order">
        <button
            type="button"
            class="grid-clause-bar__filter-btn"
            :class="{ 'is-open': orderBuilderOpen, 'has-badge': orderBadgeCount > 0 }"
            :title="t('dataGrid.orderBuilder.open')"
            :aria-label="t('dataGrid.orderBuilder.open')"
            :aria-expanded="orderBuilderOpen"
            @click="toggleOrderBuilder"
        >
          <DwIcon name="arrow-up-down" size="xs" :stroke-width="1.5"/>
          <span
              v-if="orderBadgeLabel"
              class="grid-clause-bar__filter-badge"
          >{{ orderBadgeLabel }}</span>
        </button>
        <span class="grid-clause-bar__label" aria-hidden="true">ORDER BY</span>
      </span>
      <div class="grid-clause-bar__field">
        <input
            ref="orderRef"
            v-model="orderModel"
            class="grid-clause-bar__input"
            type="text"
            spellcheck="false"
            autocomplete="off"
            :aria-label="t('dataGrid.clauseBar.orderLabel')"
            :aria-invalid="orderInvalid ? 'true' : undefined"
            :title="orderInvalid ? t('dataGrid.clauseBar.orderInvalid') : undefined"
            @focus="focusField('order')"
            @blur="blurField"
            @input="onInput"
            @keydown="onKeydown($event, 'order')"
        >
        <button
            v-if="orderModel.trim()"
            type="button"
            class="grid-clause-bar__clear"
            :title="t('dataGrid.clearFilterInput')"
            @mousedown.prevent
            @click="clearOrder"
        >
          <DwIcon name="x" size="xs" :stroke-width="1.6"/>
        </button>
      </div>
    </div>

    <Teleport to="body">
      <ul
          v-if="showSuggest"
          ref="suggestRef"
          class="grid-clause-bar__suggest"
          role="listbox"
          :style="suggestStyle"
      >
        <li
            v-for="(hint, index) in suggestions"
            :key="hint.name"
            class="grid-clause-bar__suggest-item"
            :class="{ 'is-active': index === suggestIndex }"
            role="option"
            :aria-selected="index === suggestIndex"
            @mousedown.prevent="applySuggestion(hint)"
        >
          <DwIcon name="table" size="xs" :stroke-width="1.5"/>
          <span class="grid-clause-bar__suggest-name">{{ hint.name }}</span>
          <span v-if="hint.type" class="grid-clause-bar__suggest-type">{{ hint.type }}</span>
        </li>
      </ul>
    </Teleport>

    <GridFilterBuilderPopover
        ref="filterBuilderRef"
        v-model:open="filterBuilderOpen"
        :columns="columns"
        :anchor-el="whereChipRef"
        @apply="onFilterBuilderApply"
        @clear="onFilterBuilderClear"
    />

    <GridOrderBuilderPopover
        v-model:open="orderBuilderOpen"
        :columns="columns"
        :anchor-el="orderChipRef"
        :current-order="orderModel"
        @apply="onOrderBuilderApply"
        @clear="onOrderBuilderClear"
    />
  </div>
</template>

<style scoped>
.grid-clause-bar {
  display: flex;
  align-items: stretch;
  width: 100%;
  height: var(--dw-tab-height);
  border-bottom: none;
  background: color-mix(in srgb, var(--dw-bg-panel) 94%, var(--dw-bg-editor));
}

.grid-clause-bar.is-active,
.grid-clause-bar.is-focused {
  box-shadow: inset 0 2px 0 color-mix(in srgb, var(--dw-primary) 45%, transparent);
}

.grid-clause-bar.is-where-invalid,
.grid-clause-bar.is-order-invalid {
  box-shadow: inset 0 2px 0 color-mix(in srgb, var(--dw-danger) 55%, transparent);
}

.grid-clause-bar.is-where-invalid .grid-clause-bar__pane--where,
.grid-clause-bar.is-order-invalid .grid-clause-bar__pane--order {
  background: color-mix(in srgb, var(--dw-danger) 8%, transparent);
}

.grid-clause-bar.is-where-invalid .grid-clause-bar__pane--where .grid-clause-bar__chip,
.grid-clause-bar.is-order-invalid .grid-clause-bar__pane--order .grid-clause-bar__chip {
  color: var(--dw-danger);
}

.grid-clause-bar.is-where-invalid .grid-clause-bar__pane--where .grid-clause-bar__input,
.grid-clause-bar.is-order-invalid .grid-clause-bar__pane--order .grid-clause-bar__input {
  color: var(--dw-danger);
}

.grid-clause-bar__pane {
  display: flex;
  align-items: center;
  min-width: 0;
  height: var(--dw-tab-height);
  padding: 0;
}

.grid-clause-bar__pane--where {
  flex: 0.45 1 0;
  min-width: 0;
  max-width: 42%;
}

.grid-clause-bar__pane--order {
  flex: 1 1 0;
  min-width: 0;
  border-left: none;
}

.grid-clause-bar__chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
  height: 100%;
  padding: 0 var(--dw-space-3) 0 var(--dw-space-2);
  border-right: none;
  background: color-mix(in srgb, var(--dw-bg-muted) 22%, transparent);
  color: var(--dw-primary);
}

.grid-clause-bar__filter-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--dw-control-h-xs);
  height: var(--dw-control-h-xs);
  margin-left: var(--dw-space-1);
  padding: 0;
  border: none;
  border-radius: var(--dw-control-radius-sm);
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.grid-clause-bar__filter-btn:hover,
.grid-clause-bar__filter-btn.is-open {
  background: color-mix(in srgb, var(--dw-primary) 12%, transparent);
}

.grid-clause-bar__filter-badge {
  position: absolute;
  top: -4px;
  right: -5px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: var(--dw-radius-pill);
  background: var(--dw-primary);
  color: #fff;
  font-size: var(--dw-text-2xs);
  font-weight: 700;
  font-family: var(--dw-mono);
  line-height: 14px;
  text-align: center;
  pointer-events: none;
}

.grid-clause-bar__chip--order {
  color: var(--dw-text-muted);
}

.grid-clause-bar.is-order-focused .grid-clause-bar__chip--order,
.grid-clause-bar.is-active .grid-clause-bar__pane--order .grid-clause-bar__chip--order {
  color: color-mix(in srgb, var(--dw-warning) 85%, var(--dw-text-secondary));
}

.grid-clause-bar.is-active .grid-clause-bar__chip,
.grid-clause-bar.is-where-focused .grid-clause-bar__chip {
  color: var(--dw-primary);
}

.grid-clause-bar__label {
  font-size: var(--dw-font-size-label);
  font-weight: 700;
  letter-spacing: 0.04em;
  font-family: var(--dw-mono);
  line-height: 1;
  user-select: none;
}

.grid-clause-bar__field {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0 var(--dw-space-3);
}

.grid-clause-bar__input {
  width: 100%;
  height: var(--dw-tab-height);
  min-width: 0;
  padding: 0 26px 0 0;
  border: none;
  background: transparent;
  color: var(--dw-text-primary);
  font-size: var(--dw-text-sm);
  font-family: inherit;
  line-height: var(--dw-tab-height);
  outline: none;
}

.grid-clause-bar__input::placeholder {
  color: color-mix(in srgb, var(--dw-text-secondary) 70%, var(--dw-text-primary));
  opacity: 1;
  font-weight: 400;
}

.grid-clause-bar__clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: var(--dw-control-h-xs);
  height: var(--dw-control-h-xs);
  margin-right: var(--dw-space-1);
  padding: 0;
  border: none;
  border-radius: var(--dw-btn-radius);
  background: transparent;
  color: var(--dw-text-muted);
  cursor: pointer;
}

.grid-clause-bar__clear:hover {
  color: var(--dw-text-secondary);
  background: color-mix(in srgb, var(--dw-bg-muted) 40%, transparent);
}

@media (max-width: 900px) {
  .grid-clause-bar {
    flex-direction: column;
    height: auto;
  }

  .grid-clause-bar__pane--where,
  .grid-clause-bar__pane--order {
    flex: none;
    max-width: none;
    width: 100%;
  }

  .grid-clause-bar__pane--order {
    border-left: none;
    border-top: none;
  }
}
</style>

<!-- Teleport 到 body 的菜单需要非 scoped 样式 -->
<style>
.grid-clause-bar__suggest {
  margin: 0;
  padding: var(--dw-space-1);
  list-style: none;
  max-height: 260px;
  overflow: auto;
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-btn-radius);
  background: var(--dw-bg);
  box-shadow: var(--dw-menu-shadow);
}

.grid-clause-bar__suggest-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--dw-gap-sm);
  min-height: var(--dw-control-h-sm);
  padding: 0 var(--dw-space-3);
  border-radius: calc(var(--dw-btn-radius) - 1px);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
  cursor: pointer;
}

.grid-clause-bar__suggest-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--dw-mono);
  color: var(--dw-text-primary);
}

.grid-clause-bar__suggest-type {
  font-size: var(--dw-text-xs);
  font-family: var(--dw-mono);
  color: var(--dw-text-muted);
}

.grid-clause-bar__suggest-item:hover,
.grid-clause-bar__suggest-item.is-active {
  background: var(--dw-primary-softer);
}

.grid-clause-bar__suggest-item:hover .grid-clause-bar__suggest-name,
.grid-clause-bar__suggest-item.is-active .grid-clause-bar__suggest-name {
  color: var(--dw-primary);
}
</style>
