<script setup lang="ts">
import {computed, nextTick, onMounted, onUnmounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'
import {DwSegment} from '@/core/components'
import type {
  ResultPaneColumnDensity,
  ResultPaneLayout,
  ResultPaneNumericAlign,
  ResultPaneSortOrder,
} from '@/features/workspace/services/query-result-pane-settings.service'

const props = defineProps<{
  anchorEl: HTMLElement | null
  sortOrder: ResultPaneSortOrder
  keepExistingResults: boolean
  showFieldTypes: boolean
  showFieldComments: boolean
  wrapCells: boolean
  resultLayout: ResultPaneLayout
  columnDensity: ResultPaneColumnDensity
  numericAlign: ResultPaneNumericAlign
  hideNullColumns: boolean
  typeColoring: boolean
  showGridOptions: boolean
  showLayoutOption: boolean
}>()

const emit = defineEmits<{
  'update:sortOrder': [value: ResultPaneSortOrder]
  'update:keepExistingResults': [value: boolean]
  'update:showFieldTypes': [value: boolean]
  'update:showFieldComments': [value: boolean]
  'update:wrapCells': [value: boolean]
  'update:resultLayout': [value: ResultPaneLayout]
  'update:columnDensity': [value: ResultPaneColumnDensity]
  'update:numericAlign': [value: ResultPaneNumericAlign]
  'update:hideNullColumns': [value: boolean]
  'update:typeColoring': [value: boolean]
}>()

const {t} = useI18n()

const sortTabs = computed(() => [
  {id: 'newest', label: t('queryResult.settings.sortNewest')},
  {id: 'oldest', label: t('queryResult.settings.sortOldest')},
])
const layoutTabs = computed(() => [
  {id: 'grid', label: t('queryResult.settings.layoutGrid')},
  {id: 'form', label: t('queryResult.settings.layoutForm')},
])
const cellTabs = computed(() => [
  {id: 'single', label: t('queryResult.settings.cellSingle')},
  {id: 'wrap', label: t('queryResult.settings.cellWrap')},
])
const densityTabs = computed(() => [
  {id: 'compact', label: t('queryResult.settings.densityCompact')},
  {id: 'standard', label: t('queryResult.settings.densityStandard')},
  {id: 'relaxed', label: t('queryResult.settings.densityRelaxed')},
])
const numericAlignTabs = computed(() => [
  {id: 'left', label: t('queryResult.settings.numericAlignLeft')},
  {id: 'right', label: t('queryResult.settings.numericAlignRight')},
])

const panelRef = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})
const GAP = 6
const VIEWPORT_PAD = 8
const PANEL_WIDTH = 278

function placePanel() {
  const anchor = props.anchorEl
  const panel = panelRef.value
  if (!anchor) return

  const rect = anchor.getBoundingClientRect()
  const panelHeight = panel?.offsetHeight || 360
  const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PAD
  const spaceAbove = rect.top - VIEWPORT_PAD
  const placeAbove = spaceBelow < panelHeight + GAP && spaceAbove > spaceBelow

  const maxHeight = Math.max(
      160,
      placeAbove ? spaceAbove - GAP : spaceBelow - GAP,
  )

  let left = rect.right - PANEL_WIDTH
  left = Math.min(Math.max(VIEWPORT_PAD, left), window.innerWidth - PANEL_WIDTH - VIEWPORT_PAD)

  const top = placeAbove
      ? Math.max(VIEWPORT_PAD, rect.top - GAP - Math.min(panelHeight, maxHeight))
      : rect.bottom + GAP

  panelStyle.value = {
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    width: `${PANEL_WIDTH}px`,
    maxHeight: `${Math.round(maxHeight)}px`,
  }
}

async function reposition() {
  await nextTick()
  placePanel()
  // Second pass after layout (icons / conditional rows settle height).
  requestAnimationFrame(() => placePanel())
}

function onWindowChange() {
  placePanel()
}

watch(
    () => [
      props.showGridOptions,
      props.showLayoutOption,
      props.anchorEl,
    ],
    () => {
      void reposition()
    },
    {immediate: true},
)

onMounted(() => {
  void reposition()
  window.addEventListener('resize', onWindowChange)
  window.addEventListener('scroll', onWindowChange, true)
})

onUnmounted(() => {
  window.removeEventListener('resize', onWindowChange)
  window.removeEventListener('scroll', onWindowChange, true)
})

defineExpose({
  get panelEl() {
    return panelRef.value
  },
})
</script>

<template>
  <Teleport to="body">
    <div
        ref="panelRef"
        class="view-options"
        :style="panelStyle"
        role="dialog"
        :aria-label="t('queryResult.settings.menu')"
    >
      <div class="view-options__row">
        <div class="view-options__meta">
          <DwIcon class="view-options__icon" name="arrow-up-down" size="md" :stroke-width="1.5"/>
          <span class="view-options__label">{{ t('queryResult.settings.sortLabel') }}</span>
        </div>
        <DwSegment
            size="sm"
            role="radiogroup"
            :aria-label="t('queryResult.settings.sortLabel')"
            :tabs="sortTabs"
            :model-value="sortOrder"
            @update:model-value="emit('update:sortOrder', $event as ResultPaneSortOrder)"
        />
      </div>

      <div v-if="showLayoutOption" class="view-options__row">
        <div class="view-options__meta">
          <DwIcon class="view-options__icon" name="table" size="md" :stroke-width="1.5"/>
          <span class="view-options__label">{{ t('queryResult.settings.layoutLabel') }}</span>
        </div>
        <DwSegment
            size="sm"
            role="radiogroup"
            :aria-label="t('queryResult.settings.layoutLabel')"
            :tabs="layoutTabs"
            :model-value="resultLayout"
            @update:model-value="emit('update:resultLayout', $event as ResultPaneLayout)"
        />
      </div>

      <div v-if="showGridOptions" class="view-options__row">
        <div class="view-options__meta">
          <DwIcon class="view-options__icon" name="format" size="md" :stroke-width="1.5"/>
          <span class="view-options__label">{{ t('queryResult.settings.cellLabel') }}</span>
        </div>
        <DwSegment
            size="sm"
            role="radiogroup"
            :aria-label="t('queryResult.settings.cellLabel')"
            :tabs="cellTabs"
            :model-value="wrapCells ? 'wrap' : 'single'"
            @update:model-value="emit('update:wrapCells', $event === 'wrap')"
        />
      </div>

      <div v-if="showGridOptions" class="view-options__row">
        <div class="view-options__meta">
          <DwIcon class="view-options__icon" name="layout" size="md" :stroke-width="1.5"/>
          <span class="view-options__label">{{ t('queryResult.settings.densityLabel') }}</span>
        </div>
        <DwSegment
            size="sm"
            role="radiogroup"
            :aria-label="t('queryResult.settings.densityLabel')"
            :tabs="densityTabs"
            :model-value="columnDensity"
            @update:model-value="emit('update:columnDensity', $event as ResultPaneColumnDensity)"
        />
      </div>

      <div v-if="showGridOptions" class="view-options__row">
        <div class="view-options__meta">
          <DwIcon class="view-options__icon" name="align" size="md" :stroke-width="1.5"/>
          <span class="view-options__label">{{ t('queryResult.settings.numericAlignLabel') }}</span>
        </div>
        <DwSegment
            size="sm"
            role="radiogroup"
            :aria-label="t('queryResult.settings.numericAlignLabel')"
            :tabs="numericAlignTabs"
            :model-value="numericAlign"
            @update:model-value="emit('update:numericAlign', $event as ResultPaneNumericAlign)"
        />
      </div>

      <div class="view-options__divider" role="separator"/>

      <div class="view-options__row">
        <div class="view-options__meta">
          <DwIcon class="view-options__icon" name="layers" size="md" :stroke-width="1.5"/>
          <span class="view-options__label">{{ t('queryResult.settings.keepExisting') }}</span>
        </div>
        <button
            type="button"
            class="view-options__switch"
            role="switch"
            :aria-checked="keepExistingResults"
            :class="{ 'is-on': keepExistingResults }"
            @click="emit('update:keepExistingResults', !keepExistingResults)"
        >
          <span class="view-options__switch-knob"/>
        </button>
      </div>

      <div class="view-options__row">
        <div class="view-options__meta">
          <DwIcon class="view-options__icon" name="ddl" size="md" :stroke-width="1.5"/>
          <span class="view-options__label">{{ t('queryResult.settings.showFieldTypes') }}</span>
        </div>
        <button
            type="button"
            class="view-options__switch"
            role="switch"
            :aria-checked="showFieldTypes"
            :class="{ 'is-on': showFieldTypes }"
            @click="emit('update:showFieldTypes', !showFieldTypes)"
        >
          <span class="view-options__switch-knob"/>
        </button>
      </div>

      <div class="view-options__row">
        <div class="view-options__meta">
          <DwIcon class="view-options__icon" name="comment-all" size="md" :stroke-width="1.5"/>
          <span class="view-options__label">{{ t('queryResult.settings.showFieldComments') }}</span>
        </div>
        <button
            type="button"
            class="view-options__switch"
            role="switch"
            :aria-checked="showFieldComments"
            :class="{ 'is-on': showFieldComments }"
            @click="emit('update:showFieldComments', !showFieldComments)"
        >
          <span class="view-options__switch-knob"/>
        </button>
      </div>

      <div v-if="showGridOptions" class="view-options__row">
        <div class="view-options__meta">
          <DwIcon class="view-options__icon" name="star" size="md" :stroke-width="1.5"/>
          <span class="view-options__label">{{ t('queryResult.settings.typeColoring') }}</span>
        </div>
        <button
            type="button"
            class="view-options__switch"
            role="switch"
            :aria-checked="typeColoring"
            :class="{ 'is-on': typeColoring }"
            @click="emit('update:typeColoring', !typeColoring)"
        >
          <span class="view-options__switch-knob"/>
        </button>
      </div>

      <div v-if="showGridOptions" class="view-options__row">
        <div class="view-options__meta">
          <DwIcon class="view-options__icon" name="visibility-off" size="md" :stroke-width="1.5"/>
          <span class="view-options__label">{{ t('queryResult.settings.hideNullColumns') }}</span>
        </div>
        <button
            type="button"
            class="view-options__switch"
            role="switch"
            :aria-checked="hideNullColumns"
            :class="{ 'is-on': hideNullColumns }"
            @click="emit('update:hideNullColumns', !hideNullColumns)"
        >
          <span class="view-options__switch-knob"/>
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style>
/* Teleported to body — keep unscoped, namespaced by .view-options */
.view-options {
  position: fixed;
  z-index: var(--dw-z-popover, 1200);
  overflow: auto;
  padding: 8px;
  border: 1px solid color-mix(in srgb, var(--dw-border) 70%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--dw-bg-panel) 92%, var(--dw-text) 8%);
  box-shadow:
      0 8px 28px rgb(0 0 0 / 45%),
      inset 0 0 0 1px color-mix(in srgb, #fff 3.5%, transparent);
  color: var(--dw-text);
  scrollbar-width: thin;
}

.view-options__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 12px;
  min-height: var(--dw-density-md);
  padding: 2px 4px;
}

.view-options__meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.view-options__icon {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  color: color-mix(in srgb, var(--dw-text) 48%, transparent);
}

.view-options__label {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--dw-text-sm);
  font-weight: 400;
  line-height: 1.25;
  color: color-mix(in srgb, var(--dw-text) 82%, transparent);
  white-space: nowrap;
}

.view-options__divider {
  height: 1px;
  margin: 5px 4px;
  background: color-mix(in srgb, var(--dw-border) 70%, transparent);
}

.view-options__switch {
  position: relative;
  flex-shrink: 0;
  width: 32px;
  height: 17px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dw-text) 40%, var(--dw-bg-muted));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dw-border) 55%, transparent);
  cursor: pointer;
  outline: none;
}

.view-options__switch.is-on {
  background: color-mix(in srgb, var(--dw-accent) 92%, var(--dw-on-accent) 4%);
  box-shadow: none;
}

.view-options__switch-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: var(--dw-on-accent);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--dw-text) 40%, transparent);
  transition: transform 0.14s ease;
}

.view-options__switch.is-on .view-options__switch-knob {
  transform: translateX(15px);
}
</style>
