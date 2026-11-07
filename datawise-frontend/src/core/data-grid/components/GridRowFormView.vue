<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon, DwInput, EmptyState} from '@/core/components'
import type {GridDisplayRow} from '@/core/data-grid/edit/useGridPendingEdit'
import {isAutoIncrementColumn} from '@/core/data-grid/edit/useGridPendingEdit'
import type {TableColumn} from '@/core/types'
import type {TableColumnDetail} from '@/shared/api/types'
import {
    isGridColumnPrimaryKey,
    isGridNumericColumn,
    resolveGridColumnTypeLabel,
} from '@/core/data-grid/meta/column-meta'
import {
    resolveGridCellEditorKind,
    shouldUseDedicatedCellEditor,
    type GridCellEditorKind,
} from '@/core/data-grid/services/grid-cell-editor.service'
import {formatCellDisplayValue} from '@/core/utils/cell-value-format'

const props = defineProps<{
  columns: TableColumn[]
  columnDetails: TableColumnDetail[]
  pkColumns: string[]
  row: GridDisplayRow | null
  rowNumber: number
  rowTotal: number
  canPrev: boolean
  canNext: boolean
  editable: boolean
  canUpdate: boolean
  getCellText: (columnName: string) => string
  readCellValue: (column: TableColumn) => unknown
}>()

const emit = defineEmits<{
  selectPrev: []
  selectNext: []
  fieldChange: [columnName: string, value: string]
  openEditor: [column: TableColumn]
}>()

const {t} = useI18n()

const positionLabel = computed(() =>
    props.row
        ? t('dataGrid.formView.rowOfTotal', {n: props.rowNumber, total: props.rowTotal})
        : '',
)

const fieldCountLabel = computed(() =>
    t('dataGrid.formView.fieldCount', {n: props.columns.length}),
)

function isPk(column: TableColumn): boolean {
  return isGridColumnPrimaryKey(column, props.pkColumns, props.columnDetails)
}

function isReadOnlyColumn(column: TableColumn): boolean {
  if (!props.editable || !props.canUpdate) return true
  if (props.row?.pendingDelete) return true
  if (props.row?.kind !== 'insert' && isAutoIncrementColumn(column.name, props.columnDetails)) {
    return true
  }
  return false
}

function isDedicated(column: TableColumn): boolean {
  return shouldUseDedicatedCellEditor(column, props.columnDetails, props.readCellValue(column))
}

function editorKind(column: TableColumn): GridCellEditorKind {
  return resolveGridCellEditorKind(column, props.columnDetails, props.readCellValue(column))
}

function cellText(column: TableColumn): string {
  return props.getCellText(column.name)
}

function isNullish(column: TableColumn): boolean {
  return !cellText(column)
}

function fieldPreview(column: TableColumn): string {
  const text = cellText(column)
  if (text) return formatCellDisplayValue(text, 260)
  return t('common.nullValue')
}

function expandLabel(column: TableColumn): string {
  return editorKind(column) === 'binary'
      ? t('dataGrid.formView.openPreview')
      : t('dataGrid.formView.openEditor')
}

function kindBadge(column: TableColumn): string {
  const kind = editorKind(column)
  if (kind === 'json') return t('dataGrid.formView.kindJson')
  if (kind === 'binary') return t('dataGrid.formView.kindBinary')
  if (kind === 'longText') return t('dataGrid.formView.kindText')
  return ''
}

function openDedicatedEditor(column: TableColumn) {
  emit('openEditor', column)
}

function onInput(column: TableColumn, value: string) {
  emit('fieldChange', column.name, value)
}

function onFormKeydown(event: KeyboardEvent) {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    if (!props.canPrev) return
    event.preventDefault()
    emit('selectPrev')
  } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    if (!props.canNext) return
    event.preventDefault()
    emit('selectNext')
  }
}
</script>

<template>
  <section
      v-if="row"
      class="grid-form-view"
      tabindex="0"
      @keydown="onFormKeydown"
  >
    <header class="grid-form-view__head">
      <div class="grid-form-view__head-main">
        <div class="grid-form-view__title-row">
          <span class="grid-form-view__mark" aria-hidden="true"/>
          <h3 class="grid-form-view__title">{{ t('dataGrid.formView.title') }}</h3>
          <span class="grid-form-view__count">{{ fieldCountLabel }}</span>
        </div>
        <span class="grid-form-view__pos">{{ positionLabel }}</span>
      </div>

      <div
          class="dw-step-nav grid-form-view__nav"
          role="group"
          :aria-label="t('dataGrid.formView.title')"
      >
        <button
            type="button"
            class="dw-step-nav__btn"
            :disabled="!canPrev"
            :title="t('dataGrid.formView.prevRow')"
            :aria-label="t('dataGrid.formView.prevRow')"
            @click="emit('selectPrev')"
        >
          <DwIcon name="chevron-left" size="sm" :stroke-width="2.25"/>
        </button>
        <button
            type="button"
            class="dw-step-nav__btn dw-step-nav__btn--last"
            :disabled="!canNext"
            :title="t('dataGrid.formView.nextRow')"
            :aria-label="t('dataGrid.formView.nextRow')"
            @click="emit('selectNext')"
        >
          <DwIcon name="chevron-right" size="sm" :stroke-width="2.25"/>
        </button>
      </div>
    </header>

    <div class="grid-form-view__scroll">
      <div :key="row.id" class="grid-form-view__sheet" role="list">
        <article
            v-for="column in columns"
            :key="column.name"
            class="grid-form-field"
            :class="{
              'is-pk': isPk(column),
              'is-lob': isDedicated(column),
              [`is-kind-${editorKind(column)}`]: isDedicated(column),
            }"
            role="listitem"
        >
          <div class="grid-form-field__meta">
            <div class="grid-form-field__label-wrap">
              <DwIcon
                  v-if="isPk(column)"
                  class="grid-form-field__key"
                  name="key"
                  size="xs"
                  :stroke-width="1.75"
              />
              <span class="grid-form-field__label">{{ column.name }}</span>
            </div>
            <div class="grid-form-field__tags">
              <span
                  v-if="resolveGridColumnTypeLabel(column, columnDetails)"
                  class="grid-form-field__type"
              >
                {{ resolveGridColumnTypeLabel(column, columnDetails) }}
              </span>
              <span v-if="isPk(column)" class="grid-form-field__tag grid-form-field__tag--pk">
                PK
              </span>
              <span
                  v-if="kindBadge(column)"
                  class="grid-form-field__tag"
                  :class="`grid-form-field__tag--${editorKind(column)}`"
              >
                {{ kindBadge(column) }}
              </span>
            </div>
          </div>

          <div class="grid-form-field__value">
            <button
                v-if="isDedicated(column)"
                type="button"
                class="grid-form-field__lob"
                :title="expandLabel(column)"
                @click="openDedicatedEditor(column)"
            >
              <pre
                  class="grid-form-field__preview"
                  :class="{ 'is-null': isNullish(column) }"
              >{{ fieldPreview(column) }}</pre>
              <span class="grid-form-field__expand">
                <DwIcon name="open-external" size="xs" :stroke-width="1.6"/>
                <span>{{ expandLabel(column) }}</span>
              </span>
            </button>

            <DwInput
                v-else-if="!isReadOnlyColumn(column)"
                class="grid-form-field__input"
                type="text"
                :model-value="cellText(column)"
                :class="{ 'is-numeric': isGridNumericColumn(column, columnDetails) }"
                @update:model-value="onInput(column, String($event ?? ''))"
            />

            <p
                v-else
                class="grid-form-field__readonly"
                :class="{ 'is-null': isNullish(column) }"
            >
              {{ cellText(column) || t('common.nullValue') }}
            </p>
          </div>
        </article>
      </div>
    </div>
  </section>

  <EmptyState
      v-else
      class="grid-form-view__empty"
      embedded
      :title="t('dataGrid.formView.empty')"
  >
    <template #icon>
      <DwIcon class="grid-form-view__empty-icon" name="layout" size="lg" :stroke-width="1.35"/>
    </template>
  </EmptyState>
</template>

<style scoped>
.grid-form-view {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  outline: none;
  background:
      radial-gradient(
          ellipse 70% 40% at 0% 0%,
          color-mix(in srgb, var(--dw-primary) 7%, transparent),
          transparent 55%
      ),
      var(--dw-bg);
}

.grid-form-view__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap);
  padding: var(--dw-space-4) var(--dw-space-6);
  border-bottom: 1px solid var(--dw-border-light);
  background:
      linear-gradient(
          180deg,
          color-mix(in srgb, var(--dw-bg-panel) 88%, transparent),
          color-mix(in srgb, var(--dw-bg-muted) 70%, transparent)
      );
  backdrop-filter: blur(8px);
  flex-shrink: 0;
}

.grid-form-view__head-main {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-2);
  min-width: 0;
}

.grid-form-view__title-row {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-space-3);
  min-width: 0;
}

.grid-form-view__mark {
  width: 3px;
  height: var(--dw-space-6);
  border-radius: var(--dw-radius-pill);
  background: linear-gradient(180deg, var(--dw-primary), color-mix(in srgb, var(--dw-primary) 35%, transparent));
  flex-shrink: 0;
}

.grid-form-view__title {
  margin: 0;
  font-size: var(--dw-text-sm);
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--dw-text);
}

.grid-form-view__count {
  padding: var(--dw-pad-chip);
  border-radius: var(--dw-chip-radius);
  background: color-mix(in srgb, var(--dw-text) 5%, transparent);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-2xs);
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
}

.grid-form-view__pos {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: var(--dw-space-1) var(--dw-space-4);
  border: 1px solid color-mix(in srgb, var(--dw-primary) 18%, var(--dw-border-light));
  border-radius: var(--dw-chip-radius);
  background: color-mix(in srgb, var(--dw-primary) 8%, var(--dw-bg-panel));
  color: var(--dw-primary);
  font-size: var(--dw-text-xs);
  font-family: var(--dw-mono);
  font-weight: 600;
  letter-spacing: 0.03em;
}

.grid-form-view__nav {
  flex-shrink: 0;
}

.grid-form-view__nav .dw-step-nav__btn {
  width: var(--dw-control-h-sm);
  min-width: var(--dw-control-h-sm);
  height: var(--dw-control-h-sm);
}

.grid-form-view__scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--dw-space-5) var(--dw-space-6) var(--dw-space-8);
}

.grid-form-view__sheet {
  display: flex;
  flex-direction: column;
  max-width: 920px;
  margin: 0 auto;
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-panel);
  box-shadow: var(--dw-shadow-sm), var(--dw-surface-inset-highlight);
  overflow: hidden;
  animation: grid-form-sheet-in var(--dw-duration) var(--dw-ease);
}

@keyframes grid-form-sheet-in {
  from {
    opacity: 0.55;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.grid-form-field {
  display: grid;
  grid-template-columns: minmax(132px, 26%) minmax(0, 1fr);
  gap: var(--dw-gap-md);
  align-items: start;
  padding: var(--dw-space-5) var(--dw-space-6);
  border-bottom: 1px solid var(--dw-border-light);
  position: relative;
  transition: background var(--dw-duration-fast) var(--dw-ease);
}

.grid-form-field:last-child {
  border-bottom: none;
}

.grid-form-field:hover {
  background: color-mix(in srgb, var(--dw-primary) 3.5%, transparent);
}

.grid-form-field.is-pk::before {
  content: '';
  position: absolute;
  left: 0;
  top: var(--dw-space-4);
  bottom: var(--dw-space-4);
  width: 2px;
  border-radius: var(--dw-radius-pill);
  background: var(--dw-primary);
}

.grid-form-field__meta {
  display: grid;
  gap: var(--dw-space-2);
  padding-top: var(--dw-space-2);
  min-width: 0;
}

.grid-form-field__label-wrap {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-xs);
  min-width: 0;
}

.grid-form-field__key {
  color: var(--dw-primary);
  flex-shrink: 0;
}

.grid-form-field__label {
  font-size: var(--dw-text-sm);
  font-weight: 600;
  color: var(--dw-text);
  word-break: break-word;
}

.grid-form-field.is-pk .grid-form-field__label {
  color: var(--dw-primary);
}

.grid-form-field__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-space-2);
}

.grid-form-field__type,
.grid-form-field__tag {
  display: inline-flex;
  align-items: center;
  padding: var(--dw-pad-chip);
  border-radius: var(--dw-chip-radius);
  font-size: var(--dw-text-2xs);
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: 0.02em;
}

.grid-form-field__type {
  background: color-mix(in srgb, var(--dw-text) 5%, transparent);
  color: var(--dw-text-muted);
  font-family: var(--dw-mono);
  font-weight: 500;
  text-transform: lowercase;
}

.grid-form-field__tag--pk {
  background: var(--dw-primary-soft);
  color: var(--dw-primary);
}

.grid-form-field__tag--json {
  background: color-mix(in srgb, var(--mp-tone-amber) 14%, transparent);
  color: var(--mp-tone-amber);
}

.grid-form-field__tag--longText {
  background: color-mix(in srgb, var(--mp-tone-sky) 14%, transparent);
  color: var(--mp-tone-sky);
}

.grid-form-field__tag--binary {
  background: color-mix(in srgb, var(--mp-tone-indigo) 14%, transparent);
  color: var(--mp-tone-indigo);
}

.grid-form-field__value {
  min-width: 0;
}

.grid-form-field__input,
:deep(.grid-form-field__input) {
  width: 100%;
}

.grid-form-field__input.is-numeric,
:deep(.grid-form-field__input.is-numeric) {
  text-align: right;
  font-family: var(--dw-mono);
}

.grid-form-field__readonly {
  margin: 0;
  padding: var(--dw-space-3) var(--dw-space-4);
  border-radius: var(--dw-control-radius-sm);
  background: color-mix(in srgb, var(--dw-text) 2.5%, transparent);
  font-size: var(--dw-text-sm);
  color: var(--dw-text-secondary);
  font-family: var(--dw-mono);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: var(--dw-leading);
}

.grid-form-field__readonly.is-null,
.grid-form-field__preview.is-null {
  color: var(--dw-text-muted);
  font-style: italic;
  font-family: inherit;
}

.grid-form-field__lob {
  display: grid;
  gap: var(--dw-space-3);
  width: 100%;
  padding: var(--dw-space-4);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background:
      linear-gradient(
          165deg,
          color-mix(in srgb, var(--dw-bg-muted) 80%, var(--dw-bg-panel)),
          var(--dw-bg-muted)
      );
  text-align: left;
  cursor: pointer;
  transition: border-color var(--dw-duration-fast) var(--dw-ease),
    background var(--dw-duration-fast) var(--dw-ease),
    box-shadow var(--dw-duration-fast) var(--dw-ease);
}

.grid-form-field.is-kind-json .grid-form-field__lob {
  border-color: color-mix(in srgb, var(--mp-tone-amber) 22%, var(--dw-border-light));
}

.grid-form-field.is-kind-longText .grid-form-field__lob {
  border-color: color-mix(in srgb, var(--mp-tone-sky) 22%, var(--dw-border-light));
}

.grid-form-field.is-kind-binary .grid-form-field__lob {
  border-color: color-mix(in srgb, var(--mp-tone-indigo) 22%, var(--dw-border-light));
}

.grid-form-field__lob:hover {
  border-color: color-mix(in srgb, var(--dw-primary) 40%, var(--dw-border-light));
  background: color-mix(in srgb, var(--dw-primary) 6%, var(--dw-bg-muted));
  box-shadow: var(--dw-shadow-xs);
}

.grid-form-field__preview {
  margin: 0;
  position: relative;
  font-size: var(--dw-text-xs);
  font-family: var(--dw-mono);
  color: var(--dw-text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 96px;
  overflow: hidden;
  line-height: var(--dw-leading-snug);
  mask-image: linear-gradient(180deg, black 62%, transparent);
}

.grid-form-field__expand {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-space-2);
  width: fit-content;
  padding: var(--dw-space-1) var(--dw-space-3);
  border-radius: var(--dw-chip-radius);
  background: color-mix(in srgb, var(--dw-primary) 10%, transparent);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  color: var(--dw-primary);
}

.grid-form-view__empty {
  flex: 1;
}

.grid-form-view__empty-icon {
  opacity: 0.45;
  color: var(--dw-primary);
}

@media (max-width: 720px) {
  .grid-form-view__scroll {
    padding: var(--dw-space-4);
  }

  .grid-form-field {
    grid-template-columns: 1fr;
    gap: var(--dw-space-3);
    padding: var(--dw-space-4) var(--dw-space-5);
  }

  .grid-form-field__meta {
    padding-top: 0;
  }
}
</style>
