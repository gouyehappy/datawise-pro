<script setup lang="ts">
/**
 * Grid-friendly searchable popup: trigger shows value; panel has search + list + optional help.
 * Unlike DwSelect (search lives in the trigger), this matches a “popover + search” pattern.
 */
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import EmptyState from './EmptyState.vue'
import {DwIcon} from '@datawise/icons'
import {useDwI18n} from '../i18n/useDwI18n'

export type DwSearchablePopupOption = {
  value: string
  label?: string
  /** Optional CSS class for colored labels (e.g. default-value tones). */
  toneClass?: string
}

const props = withDefaults(
    defineProps<{
      options: Array<string | DwSearchablePopupOption>
      placeholder?: string
      searchPlaceholder?: string
      emptyText?: string
      disabled?: boolean
      /** Allow committing the search text as a custom value (Enter). */
      allowCustom?: boolean
      /** Flat cell trigger for dense grids. */
      variant?: 'default' | 'cell'
      /** Side help card: shown only after dwelling on an option that has help text. */
      optionHelp?: (value: string) => string | undefined
      /** Extra class on option label (e.g. type tone). */
      optionClass?: (value: string) => string | undefined
      /** Display transform for the trigger label. */
      displayValue?: (value: string) => string
      menuMinWidth?: number
      menuMaxHeight?: number
    }>(),
    {
      placeholder: '',
      disabled: false,
      allowCustom: true,
      variant: 'default',
      menuMinWidth: 200,
      menuMaxHeight: 260,
    },
)

const t = useDwI18n()
const resolvedSearchPlaceholder = computed(
  () => props.searchPlaceholder ?? t('common.searchablePopup.searchPlaceholder'),
)
const resolvedEmptyText = computed(
  () => props.emptyText ?? t('common.searchablePopup.empty'),
)

const model = defineModel<string>({required: true})

const open = ref(false)
const search = ref('')
const highlight = ref(0)
const triggerRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const searchRef = ref<HTMLInputElement | null>(null)
const helpOption = ref<string | null>(null)
const panelStyle = ref<Record<string, string>>({})
const helpStyle = ref<Record<string, string>>({})
/** Help stays hidden until the user deliberately hovers an option. */
const helpVisible = ref(false)
let helpTimer: ReturnType<typeof setTimeout> | null = null
const HELP_DWELL_MS = 420

function clearHelpTimer() {
  if (helpTimer) {
    clearTimeout(helpTimer)
    helpTimer = null
  }
}

function hideHelp() {
  clearHelpTimer()
  helpVisible.value = false
  helpOption.value = null
}

function scheduleHelp(value: string) {
  if (!props.optionHelp) return
  clearHelpTimer()
  const text = props.optionHelp(value)
  if (!text) {
    hideHelp()
    return
  }
  helpOption.value = value
  // Keep existing card parked while switching; only delay the first reveal.
  if (helpVisible.value) {
    void nextTick(() => refreshHelpPosition())
    return
  }
  helpTimer = setTimeout(() => {
    helpVisible.value = true
    void nextTick(() => refreshHelpPosition())
  }, HELP_DWELL_MS)
}

const normalizedOptions = computed<DwSearchablePopupOption[]>(() =>
    props.options.map((item) =>
        typeof item === 'string' ? {value: item, label: item} : {
          value: item.value,
          label: item.label ?? item.value,
          toneClass: item.toneClass,
        },
    ),
)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return normalizedOptions.value
  return normalizedOptions.value.filter((item) => {
    const label = (item.label ?? item.value).toLowerCase()
    return label.includes(q) || item.value.toLowerCase().includes(q)
  })
})

const triggerLabel = computed(() => {
  const raw = model.value
  if (!raw) return ''
  if (props.displayValue) return props.displayValue(raw)
  const hit = normalizedOptions.value.find((item) => item.value === raw)
  return hit?.label ?? raw
})

const helpText = computed(() => {
  const key = helpOption.value
  if (!key || !props.optionHelp) return undefined
  return props.optionHelp(key)
})

const showCustomRow = computed(() => {
  if (!props.allowCustom) return false
  const q = search.value.trim()
  if (!q) return false
  return !filtered.value.some(
      (item) => item.value.toLowerCase() === q.toLowerCase() || (item.label ?? '').toLowerCase() === q.toLowerCase(),
  )
})

watch(open, async (isOpen) => {
  if (!isOpen) {
    search.value = ''
    hideHelp()
    helpStyle.value = {}
    return
  }
  // Open with no help card — only hover reveals it.
  hideHelp()
  const idx = filtered.value.findIndex((item) => item.value === model.value)
  highlight.value = idx >= 0 ? idx : 0
  await nextTick()
  placePanel()
  // Re-measure after paint — nested fixed popovers can settle one frame later.
  requestAnimationFrame(() => {
    if (open.value) placePanel()
  })
  searchRef.value?.focus()
  searchRef.value?.select()
})

watch(helpText, () => {
  if (open.value && helpVisible.value) void nextTick(() => refreshHelpPosition())
})

watch(filtered, (list) => {
  if (highlight.value >= list.length) highlight.value = Math.max(0, list.length - 1)
})

function placePanel() {
  const trigger = triggerRef.value
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  const width = Math.max(props.menuMinWidth, rect.width)
  const spaceBelow = window.innerHeight - rect.bottom - 8
  const spaceAbove = rect.top - 8
  const preferBelow = spaceBelow >= 180 || spaceBelow >= spaceAbove
  const maxH = Math.min(props.menuMaxHeight, preferBelow ? spaceBelow : spaceAbove)
  let left = rect.left
  if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8)
  const top = preferBelow ? rect.bottom + 4 : undefined
  const bottom = preferBelow ? undefined : window.innerHeight - rect.top + 4
  panelStyle.value = {
    position: 'fixed',
    left: `${left}px`,
    width: `${width}px`,
    maxHeight: `${Math.max(160, maxH)}px`,
    // Above clause-bar / filter popovers (dropdown=120, popover=140).
    zIndex: 'var(--dw-z-select-portal)',
    ...(top != null ? {top: `${top}px`} : {bottom: `${bottom}px`}),
  }
  if (helpVisible.value) placeHelp(left, width, top, bottom, maxH)
}

/** Float help card beside the list (dbx-style), not squeezed inside the menu. */
function placeHelp(
    panelLeft: number,
    panelWidth: number,
    top: number | undefined,
    bottom: number | undefined,
    maxH: number,
) {
  if (!props.optionHelp) {
    helpStyle.value = {}
    return
  }
  const gap = 8
  const helpW = 220
  let helpLeft = panelLeft + panelWidth + gap
  if (helpLeft + helpW > window.innerWidth - 8) {
    helpLeft = Math.max(8, panelLeft - helpW - gap)
  }
  // Align with highlighted option when possible
  let offsetY = 36 // roughly below search bar
  const active = panelRef.value?.querySelector('.dw-sp__option.is-active') as HTMLElement | null
  const panel = panelRef.value
  if (active && panel) {
    const ar = active.getBoundingClientRect()
    const pr = panel.getBoundingClientRect()
    offsetY = Math.max(0, ar.top - pr.top)
  }
  helpStyle.value = {
    position: 'fixed',
    left: `${helpLeft}px`,
    width: `${helpW}px`,
    maxHeight: `${Math.min(180, maxH)}px`,
    zIndex: 'calc(var(--dw-z-select-portal) + 1)',
    ...(top != null
      ? {top: `${top + offsetY}px`}
      : {bottom: `${(bottom ?? 0) + Math.max(0, maxH - offsetY - 80)}px`}),
  }
}

function refreshHelpPosition() {
  if (!open.value || !helpText.value) return
  const panel = panelRef.value
  if (!panel) return
  const pr = panel.getBoundingClientRect()
  placeHelp(
      pr.left,
      pr.width,
      panelStyle.value.top ? parseFloat(panelStyle.value.top) : undefined,
      panelStyle.value.bottom ? parseFloat(panelStyle.value.bottom) : undefined,
      parseFloat(panelStyle.value.maxHeight || '260') || 260,
  )
}

function openPanel() {
  if (props.disabled) return
  open.value = true
}

function closePanel() {
  open.value = false
}

function pick(value: string) {
  model.value = value
  closePanel()
}

function pickCustom() {
  const q = search.value.trim()
  if (!q) return
  pick(q)
}

function onTriggerKeydown(event: KeyboardEvent) {
  if (props.disabled) return
  if (event.key === 'Enter' || event.key === 'ArrowDown' || event.key === ' ') {
    event.preventDefault()
    openPanel()
  }
}

function onSearchKeydown(event: KeyboardEvent) {
  const listLen = filtered.value.length + (showCustomRow.value ? 1 : 0)
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (!listLen) return
    highlight.value = (highlight.value + 1) % listLen
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (!listLen) return
    highlight.value = (highlight.value - 1 + listLen) % listLen
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    if (showCustomRow.value && highlight.value === filtered.value.length) {
      pickCustom()
      return
    }
    const item = filtered.value[highlight.value]
    if (item) pick(item.value)
    else if (props.allowCustom && search.value.trim()) pickCustom()
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    closePanel()
  }
}

function onDocPointerDown(event: PointerEvent) {
  if (!open.value) return
  const target = event.target as Node | null
  if (!target) return
  if (triggerRef.value?.contains(target)) return
  if (panelRef.value?.contains(target)) return
  closePanel()
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown, true)
  window.addEventListener('resize', placePanel)
  window.addEventListener('scroll', placePanel, true)
})

onBeforeUnmount(() => {
  clearHelpTimer()
  document.removeEventListener('pointerdown', onDocPointerDown, true)
  window.removeEventListener('resize', placePanel)
  window.removeEventListener('scroll', placePanel, true)
})
</script>

<template>
  <div
      class="dw-sp"
      :class="[`dw-sp--${variant}`, { 'is-open': open, 'is-disabled': disabled }]"
  >
    <button
        ref="triggerRef"
        type="button"
        class="dw-sp__trigger"
        :disabled="disabled"
        @click="open ? closePanel() : openPanel()"
        @keydown="onTriggerKeydown"
    >
      <span
          class="dw-sp__value"
          :class="[optionClass?.(model) , !triggerLabel ? 'is-placeholder' : '']"
      >
        {{ triggerLabel || placeholder || '—' }}
      </span>
      <DwIcon name="chevron-down" size="xs" class="dw-sp__chevron" :stroke-width="2"/>
    </button>

    <Teleport to="body">
      <div
          v-if="open"
          ref="panelRef"
          class="dw-sp__panel"
          :style="panelStyle"
          role="listbox"
      >
        <div class="dw-sp__search">
          <DwIcon name="search" size="sm" class="dw-sp__search-icon" :stroke-width="2"/>
          <input
              ref="searchRef"
              v-model="search"
              type="search"
              class="dw-sp__search-input"
              :placeholder="resolvedSearchPlaceholder"
              autocomplete="off"
              spellcheck="false"
              @keydown="onSearchKeydown"
              @input="highlight = 0"
          />
        </div>

        <ul class="dw-sp__list" @mouseleave="hideHelp">
          <li
              v-for="(item, index) in filtered"
              :key="item.value"
              class="dw-sp__option"
              :class="{
                'is-active': index === highlight,
                'is-selected': item.value === model,
              }"
              role="option"
              :aria-selected="item.value === model"
              @mouseenter="highlight = index; scheduleHelp(item.value)"
              @pointerdown.prevent="pick(item.value)"
            >
            <DwIcon
                v-if="item.value === model"
                name="check"
                size="sm"
                class="dw-sp__check"
                :stroke-width="2.4"
            />
            <span v-else class="dw-sp__check-spacer"/>
            <span
                class="dw-sp__option-label"
                :class="[item.toneClass, optionClass?.(item.value)]"
            >{{ item.label }}</span>
          </li>
          <li
              v-if="showCustomRow"
              class="dw-sp__option dw-sp__option--custom"
              :class="{ 'is-active': highlight === filtered.length }"
              role="option"
              @mouseenter="highlight = filtered.length; hideHelp()"
              @pointerdown.prevent="pickCustom"
          >
            <span class="dw-sp__check-spacer"/>
            <span class="dw-sp__option-label">{{ search.trim() }}</span>
          </li>
          <li v-if="!filtered.length && !showCustomRow" class="dw-sp__empty" role="presentation">
            <EmptyState embedded compact :title="resolvedEmptyText"/>
          </li>
        </ul>
      </div>

      <aside
          v-if="open && helpVisible && helpText"
          class="dw-sp__help"
          :style="helpStyle"
          role="note"
      >
        {{ helpText }}
      </aside>
    </Teleport>
  </div>
</template>

<style scoped>
.dw-sp {
  position: relative;
  min-width: 0;
  width: 100%;
}

.dw-sp__trigger {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 14px;
  align-items: center;
  gap: 2px;
  width: 100%;
  margin: 0;
  padding: 0 2px 0 4px;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius, 6px);
  background: var(--dw-bg-panel);
  color: var(--dw-text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.dw-sp--cell .dw-sp__trigger {
  height: var(--dw-density-xs);
  border: none;
  border-radius: 0;
  background: transparent;
  padding: 0 2px;
}

.dw-sp--default .dw-sp__trigger {
  min-height: var(--dw-control-h, 32px);
}

.dw-sp__trigger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dw-sp.is-open .dw-sp__trigger,
.dw-sp__trigger:focus-visible {
  outline: none;
}

.dw-sp--default.is-open .dw-sp__trigger,
.dw-sp--default .dw-sp__trigger:focus-visible {
  border-color: var(--dw-primary);
}

.dw-sp__value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--dw-font-mono, ui-monospace, monospace);
  font-weight: 600;
  font-size: inherit;
}

.dw-sp__value.is-placeholder {
  color: var(--dw-text-muted);
  font-weight: 500;
}

.dw-sp__chevron {
  color: var(--dw-text-muted);
  opacity: 0.55;
  justify-self: end;
}

.dw-sp:hover .dw-sp__chevron,
.dw-sp.is-open .dw-sp__chevron {
  opacity: 1;
}
</style>

<style>
.dw-sp__panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--dw-border) 85%, transparent);
  border-radius: var(--dw-menu-radius, var(--dw-panel-radius));
  background: color-mix(in srgb, var(--dw-bg-panel) 96%, var(--dw-bg-muted));
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--dw-text) 4%, transparent),
    0 12px 32px color-mix(in srgb, var(--dw-text) 20%, transparent);
}

.dw-sp__search {
  display: flex;
  align-items: center;
  gap: var(--dw-space-2);
  flex-shrink: 0;
  margin: var(--dw-space-2) var(--dw-space-2) 0;
  padding: 0 var(--dw-space-2);
  height: var(--dw-density-sm);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background: color-mix(in srgb, var(--dw-bg-editor, var(--dw-bg-panel)) 88%, transparent);
}

.dw-sp__search-icon {
  color: var(--dw-text-muted);
  flex-shrink: 0;
  opacity: 0.85;
}

.dw-sp__search-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--dw-text-primary);
  font-size: var(--dw-text-sm);
  outline: none;
}

.dw-sp__search-input::placeholder {
  color: var(--dw-text-muted);
}

.dw-sp__list {
  flex: 1;
  min-width: 0;
  min-height: 0;
  margin: 0;
  padding: 4px 6px 6px;
  overflow: auto;
  list-style: none;
}

.dw-sp__option {
  display: flex;
  align-items: center;
  gap: var(--dw-space-2);
  min-height: var(--dw-density-sm);
  padding: var(--dw-space-1) var(--dw-space-2);
  border-radius: var(--dw-control-radius);
  cursor: pointer;
  color: var(--dw-text-primary);
  font-size: var(--dw-text-sm);
}

.dw-sp__option.is-active,
.dw-sp__option:hover {
  background: color-mix(in srgb, var(--dw-bg-muted) 70%, transparent);
}

.dw-sp__option.is-selected {
  background: color-mix(in srgb, var(--dw-primary) 14%, transparent);
}

.dw-sp__option.is-selected.is-active {
  background: color-mix(in srgb, var(--dw-primary) 18%, transparent);
}

.dw-sp__check {
  flex-shrink: 0;
  width: 14px;
  color: var(--dw-primary);
}

.dw-sp__check-spacer {
  width: 14px;
  flex-shrink: 0;
}

.dw-sp__option-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--dw-font-mono, ui-monospace, monospace);
  font-weight: 550;
}

/* Type tones (teleported list — not under .col-type) */
.dw-sp__option-label.is-tone-text,
.dw-sp__option-label.is-tone-json {
  color: #16a34a;
}

.dw-sp__option-label.is-tone-numeric,
.dw-sp__option-label.is-tone-boolean {
  color: #2563eb;
}

.dw-sp__option-label.is-tone-real {
  color: #6366f1;
}

.dw-sp__option-label.is-tone-temporal {
  color: #d97706;
}

.dw-sp__option-label.is-tone-binary {
  color: #9333ea;
}

.dw-sp__option-label.is-tone-enum,
.dw-sp__option-label.is-tone-other {
  color: #78716c;
}

.dw-sp__option-label.is-tone-spatial {
  color: #0e7490;
}

:root.dark .dw-sp__option-label.is-tone-text,
:root.dark .dw-sp__option-label.is-tone-json,
[data-theme='dark'] .dw-sp__option-label.is-tone-text,
[data-theme='dark'] .dw-sp__option-label.is-tone-json {
  color: #86efac;
}

:root.dark .dw-sp__option-label.is-tone-numeric,
:root.dark .dw-sp__option-label.is-tone-boolean,
[data-theme='dark'] .dw-sp__option-label.is-tone-numeric,
[data-theme='dark'] .dw-sp__option-label.is-tone-boolean {
  color: #93c5fd;
}

:root.dark .dw-sp__option-label.is-tone-real,
[data-theme='dark'] .dw-sp__option-label.is-tone-real {
  color: #a5b4fc;
}

:root.dark .dw-sp__option-label.is-tone-temporal,
[data-theme='dark'] .dw-sp__option-label.is-tone-temporal {
  color: #fcd34d;
}

:root.dark .dw-sp__option-label.is-tone-binary,
[data-theme='dark'] .dw-sp__option-label.is-tone-binary {
  color: #d8b4fe;
}

:root.dark .dw-sp__option-label.is-tone-enum,
:root.dark .dw-sp__option-label.is-tone-other,
[data-theme='dark'] .dw-sp__option-label.is-tone-enum,
[data-theme='dark'] .dw-sp__option-label.is-tone-other {
  color: #d4d4aa;
}

:root.dark .dw-sp__option-label.is-tone-spatial,
[data-theme='dark'] .dw-sp__option-label.is-tone-spatial {
  color: #67e8f9;
}

/* Default-value presets */
.dw-sp__option-label.is-def-null {
  color: var(--dw-text-muted);
}

.dw-sp__option-label.is-def-num {
  color: #60a5fa;
}

.dw-sp__option-label.is-def-time {
  color: #fbbf24;
}

.dw-sp__option-label.is-def-string {
  color: #86efac;
}

.dw-sp__option--custom .dw-sp__option-label {
  color: var(--dw-primary);
}

.dw-sp__empty {
  list-style: none;
  padding: 4px 2px;
}

.dw-sp__empty :deep(.dw-empty) {
  padding: 10px 8px;
}

.dw-sp__empty :deep(p) {
  font-size: var(--dw-text-sm);
  font-weight: 400;
  color: var(--dw-text-muted);
}

.dw-sp__help {
  box-sizing: border-box;
  max-width: min(240px, calc(100vw - 24px));
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--dw-border) 90%, transparent);
  border-radius: var(--dw-menu-radius, var(--dw-panel-radius));
  background: color-mix(in srgb, var(--dw-bg-panel) 94%, var(--dw-bg-muted));
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
  line-height: 1.55;
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--dw-text) 4%, transparent),
    0 10px 28px color-mix(in srgb, var(--dw-text) 18%, transparent);
  overflow: hidden;
  pointer-events: none;
}
</style>
