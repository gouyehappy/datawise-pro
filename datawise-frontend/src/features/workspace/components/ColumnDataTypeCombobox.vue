<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import type {ComponentPublicInstance} from 'vue'
import type {DbType} from '@/core/types'
import {DwIcon} from '@/core/icons'
import {
    applySelectedColumnDataType,
    filterColumnDataTypeSuggestions,
} from '@/features/workspace/services/column-data-type-options.service'

const props = withDefaults(
    defineProps<{
      id?: string
      dbType?: DbType
      overlay?: boolean
      commitOnBlur?: boolean
      baseOnly?: boolean
      placeholder?: string
      disabled?: boolean
      autofocus?: boolean
    }>(),
    {overlay: false, commitOnBlur: false, baseOnly: false, autofocus: false},
)

const model = defineModel<string>({required: true})
const emit = defineEmits<{
  commit: []
  cancel: []
}>()

const rootRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const menuOpen = ref(false)
const menuReady = ref(false)
const highlightIndex = ref(0)
const menuStyle = ref<Record<string, string>>({
  position: 'fixed',
  top: '0px',
  left: '0px',
  width: '120px',
  visibility: 'hidden',
  zIndex: '80',
})
let blurTimer: ReturnType<typeof setTimeout> | null = null
let positionFrame = 0

const options = computed(() =>
    filterColumnDataTypeSuggestions(props.dbType, model.value, model.value),
)

watch(options, (list) => {
  if (highlightIndex.value >= list.length) {
    highlightIndex.value = Math.max(0, list.length - 1)
  }
})

watch(
    () => props.autofocus,
    async (focus) => {
      if (!focus) return
      await nextTick()
      // 等单元格进入编辑态布局稳定后再打开，避免定位跳动
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      focusInput()
      void openMenu()
      const idx = options.value.findIndex(
          (item) => item.toLowerCase() === model.value.trim().toLowerCase(),
      )
      highlightIndex.value = idx >= 0 ? idx : 0
    },
    {immediate: true},
)

watch(menuOpen, async (open) => {
  if (!open) {
    menuReady.value = false
    return
  }
  await nextTick()
  placeMenu()
})

watch(highlightIndex, () => {
  void nextTick(() => scrollHighlightIntoView())
})

onMounted(() => {
  window.addEventListener('resize', placeMenu)
  window.addEventListener('scroll', placeMenu, true)
})

onBeforeUnmount(() => {
  if (blurTimer) clearTimeout(blurTimer)
  if (positionFrame) cancelAnimationFrame(positionFrame)
  window.removeEventListener('resize', placeMenu)
  window.removeEventListener('scroll', placeMenu, true)
})

function bindInput(el: Element | ComponentPublicInstance | null) {
  inputRef.value = (el instanceof HTMLInputElement ? el : null)
}

function bindMenu(el: Element | ComponentPublicInstance | null) {
  menuRef.value = (el instanceof HTMLElement ? el : null)
}

function focusInput() {
  const input = inputRef.value
  if (!input) return
  input.focus({preventScroll: true})
  const end = input.value.length
  input.setSelectionRange(end, end)
  input.scrollLeft = 0
}

function clearBlurTimer() {
  if (blurTimer) {
    clearTimeout(blurTimer)
    blurTimer = null
  }
}

/** 列宽取表头，垂直位置取当前单元格，避免行内编辑态宽度抖动 */
function resolveMenuBox(): {left: number; top: number; width: number} | null {
  const root = rootRef.value
  if (!root) return null
  const cell = root.closest('td')
  const table = root.closest('table')
  const header = table?.querySelector('th.col-data-type') as HTMLElement | null
  const cellRect = (cell ?? root).getBoundingClientRect()
  const width = Math.max(
      Math.round(header?.getBoundingClientRect().width ?? cellRect.width),
      96,
  )
  let left = Math.round(cellRect.left)
  const maxLeft = Math.max(8, window.innerWidth - width - 8)
  left = Math.min(Math.max(8, left), maxLeft)
  return {
    left,
    top: Math.round(cellRect.bottom + 2),
    width,
  }
}

function placeMenu() {
  if (!menuOpen.value) return
  const box = resolveMenuBox()
  if (!box) return
  menuStyle.value = {
    position: 'fixed',
    top: `${box.top}px`,
    left: `${box.left}px`,
    width: `${box.width}px`,
    minWidth: `${box.width}px`,
    maxWidth: `${box.width}px`,
    visibility: 'visible',
    zIndex: '80',
  }
  menuReady.value = true
}

function scrollHighlightIntoView() {
  const menu = menuRef.value
  const item = menu?.querySelector<HTMLElement>(`[data-index="${highlightIndex.value}"]`)
  if (!menu || !item) return
  // 只滚菜单自身，避免 scrollIntoView 带动页面跳动
  const top = item.offsetTop
  const bottom = top + item.offsetHeight
  if (top < menu.scrollTop) {
    menu.scrollTop = top
  } else if (bottom > menu.scrollTop + menu.clientHeight) {
    menu.scrollTop = bottom - menu.clientHeight
  }
}

async function openMenu() {
  if (props.disabled) return
  menuReady.value = false
  menuOpen.value = true
  await nextTick()
  placeMenu()
  if (positionFrame) cancelAnimationFrame(positionFrame)
  positionFrame = requestAnimationFrame(() => {
    placeMenu()
    scrollHighlightIntoView()
  })
}

function toggleMenu(event?: Event) {
  event?.preventDefault()
  event?.stopPropagation()
  if (props.disabled) return
  if (menuOpen.value) {
    menuOpen.value = false
    return
  }
  focusInput()
  openMenu()
}

function pickBaseType(baseType: string) {
  clearBlurTimer()
  model.value = props.baseOnly
      ? baseType.trim()
      : applySelectedColumnDataType(model.value, baseType)
  menuOpen.value = false
  void nextTick(() => focusInput())
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    openMenu()
    if (!options.value.length) return
    highlightIndex.value = (highlightIndex.value + 1) % options.value.length
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    openMenu()
    if (!options.value.length) return
    highlightIndex.value = (highlightIndex.value - 1 + options.value.length) % options.value.length
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    if (menuOpen.value && options.value[highlightIndex.value]) {
      pickBaseType(options.value[highlightIndex.value]!)
      return
    }
    if (props.commitOnBlur) emit('commit')
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    if (menuOpen.value) {
      menuOpen.value = false
      return
    }
    emit('cancel')
  }
}

function onInput() {
  openMenu()
  highlightIndex.value = 0
}

function onFocus() {
  // autofocus 路径由 watcher 延后打开，避免编辑态布局未稳时抢先定位造成跳动
  if (props.autofocus) return
  void openMenu()
}

function onBlur() {
  clearBlurTimer()
  blurTimer = setTimeout(() => {
    menuOpen.value = false
    if (props.commitOnBlur) emit('commit')
  }, 120)
}

function onOptionPointerDown(event: PointerEvent, option: string) {
  event.preventDefault()
  pickBaseType(option)
}
</script>

<template>
  <div
      ref="rootRef"
      class="column-type-combo"
      :class="{
        'column-type-combo--overlay': overlay,
        'is-open': menuOpen,
      }"
  >
    <input
        :id="id"
        :ref="bindInput"
        v-model="model"
        class="column-type-combo__input mono"
        type="text"
        :placeholder="placeholder || 'varchar'"
        :disabled="disabled"
        autocomplete="off"
        spellcheck="false"
        @keydown="onKeydown"
        @input="onInput"
        @focus="onFocus"
        @blur="onBlur"
    />
    <button
        class="column-type-combo__chevron"
        type="button"
        tabindex="-1"
        :disabled="disabled"
        aria-label="type"
        @mousedown.prevent="toggleMenu"
    >
      <DwIcon name="chevron-down" size="xs" :stroke-width="2"/>
    </button>
    <Teleport to="body">
      <ul
          v-if="menuOpen && options.length"
          :ref="bindMenu"
          class="column-type-combo__menu"
          :class="{ 'is-ready': menuReady }"
          role="listbox"
          :style="menuStyle"
      >
        <li
            v-for="(option, index) in options"
            :key="option"
            class="column-type-combo__option"
            :class="{ 'is-active': index === highlightIndex }"
            role="option"
            :data-index="index"
            :aria-selected="index === highlightIndex"
            @pointerdown="onOptionPointerDown($event, option)"
        >
          {{ option }}
        </li>
      </ul>
    </Teleport>
  </div>
</template>

<style scoped>
.column-type-combo {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 1.25rem;
  align-items: stretch;
  min-width: 0;
  background: var(--dw-bg-editor);
}

.column-type-combo__input {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 100%;
  margin: 0;
  border: 0;
  background: transparent;
  color: var(--dw-text-primary);
  caret-color: var(--dw-primary);
  font: inherit;
  font-family: var(--dw-mono);
  font-weight: 600;
  line-height: 1.4;
  outline: none;
  appearance: none;
}

.column-type-combo__chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--dw-text-muted);
  cursor: pointer;
}

.column-type-combo__chevron:hover:not(:disabled) {
  color: var(--dw-text-primary);
}

.column-type-combo--overlay {
  position: absolute;
  inset: 0;
  box-shadow: inset 0 0 0 1px var(--dw-primary);
}

.column-type-combo--overlay .column-type-combo__input {
  padding: 4px 2px 4px 8px;
}

.column-type-combo:not(.column-type-combo--overlay) {
  min-height: var(--dw-control-h);
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius);
}

.column-type-combo:not(.column-type-combo--overlay).is-open,
.column-type-combo:not(.column-type-combo--overlay):focus-within {
  border-color: var(--dw-primary);
}

.column-type-combo:not(.column-type-combo--overlay) .column-type-combo__input {
  height: auto;
  padding: 0 4px 0 10px;
}
</style>

<style>
.column-type-combo__menu {
  box-sizing: border-box;
  margin: 0;
  padding: 2px;
  overflow: auto;
  max-height: 12rem;
  list-style: none;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg-panel);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--dw-text) 28%, transparent);
  opacity: 0;
  pointer-events: none;
}

.column-type-combo__menu.is-ready {
  opacity: 1;
  pointer-events: auto;
}

.column-type-combo__option {
  box-sizing: border-box;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 3px 8px;
  border-radius: var(--dw-radius-xs);
  color: var(--dw-text-primary);
  font-family: var(--dw-mono);
  font-size: var(--dw-text-sm);
  line-height: 1.4;
  cursor: pointer;
  white-space: nowrap;
}

.column-type-combo__option:hover,
.column-type-combo__option.is-active {
  background: color-mix(in srgb, var(--dw-primary) 20%, transparent);
  color: var(--dw-text-primary);
}
</style>
