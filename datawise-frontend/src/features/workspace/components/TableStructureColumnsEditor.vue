<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, DwConfirmAlert, DwSearchablePopup, EmptyState, ModalActions} from '@/core/components'
import {DwIcon} from '@/core/icons'
import type {DbType} from '@/core/types'
import type {TableColumnDetail} from '@/shared/api/types'
import {executeAlterColumnSql} from '@/features/workspace/services/execute-alter-column.service'
import {
    listColumnDataTypeSuggestions,
    typeSupportsLength,
    typeSupportsScale,
} from '@/features/workspace/services/column-data-type-options.service'
import {getMysqlDataTypeHelpKey} from '@/features/workspace/services/mysql-data-type-help'
import {
    buildTableStructureChangeSql,
    hasUnsupportedPhysicalReorder,
} from '@/features/workspace/services/table-structure-change-sql.service'
import {getTableStructureCapabilities} from '@/features/workspace/services/table-structure-capabilities.service'
import {
    cloneColumnDraftAsNew,
    createColumnDrafts,
    createEmptyColumnDraft,
    insertColumnDraft,
    isDraftDirty,
    markOrRemoveColumn,
    matchesColumnSearch,
    reorderColumnDrafts,
    type EditableColumnDraft,
} from '@/features/workspace/services/table-structure-draft.service'
import {
    getColumnDefaultPresets,
    getMysqlCharsetOptions,
    getMysqlCollationOptions,
} from '@/features/workspace/services/table-structure-presets.service'
import {structureDataTypeTone} from '@/features/workspace/services/table-structure-type-tone.service'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

const props = defineProps<{
  columns: TableColumnDetail[]
  dbType?: DbType
  tableName: string
  database?: string
  connectionId?: string
  canExecute?: boolean
  executeDisabledHint?: string
  productionEnv?: boolean
  lineageColumn?: string | null
  lineageCountsFor?: (columnName: string) => {upstream: number; downstream: number}
  showVectorFor?: (dataType: string) => boolean
}>()

const emit = defineEmits<{
  applied: []
  'toggle-lineage': [columnName: string]
  'open-vector': [columnName: string]
}>()

const {t} = useI18n()
const layout = useLayoutStore()

const caps = computed(() => getTableStructureCapabilities(props.dbType))
const drafts = ref<EditableColumnDraft[]>([])
const search = ref('')
const selectedId = ref<string | null>(null)
const executing = ref(false)
const confirmOpen = ref(false)
const dragFromId = ref<string | null>(null)
const previewOpen = ref(false)

watch(
    () => [props.columns, props.dbType] as const,
    () => {
      drafts.value = createColumnDrafts(props.columns, props.dbType)
      selectedId.value = null
    },
    {immediate: true, deep: true},
)

const visibleDrafts = computed(() =>
    drafts.value.filter((draft) => matchesColumnSearch(draft, search.value)),
)

const dirty = computed(() => isDraftDirty(drafts.value, props.dbType))

const pendingSql = computed(() =>
    buildTableStructureChangeSql({
      dbType: props.dbType,
      tableName: props.tableName,
      database: props.database,
      drafts: drafts.value,
    }),
)

watch(dirty, (isDirty) => {
  if (isDirty) previewOpen.value = true
})

const applyEnabled = computed(
    () => dirty.value && !!pendingSql.value.trim() && props.canExecute !== false && !executing.value,
)

const colSpan = computed(() => {
  let n = 9 // # actions name type len scale nullable default comment
  if (props.lineageCountsFor) n += 1
  if (caps.value.primaryKeyToggle) n += 1
  if (caps.value.showCharacterSet) n += 2
  if (caps.value.showExtendedAttrs) n += 1
  return n
})

const dataTypeOptions = computed(() => listColumnDataTypeSuggestions(props.dbType))
const defaultPresets = computed(() => getColumnDefaultPresets(props.dbType))
const charsetOptions = computed(() => getMysqlCharsetOptions())

function collationOptionsFor(charset: string): string[] {
  return getMysqlCollationOptions(charset)
}

function typeHelp(baseType: string): string | undefined {
  const key = getMysqlDataTypeHelpKey(baseType)
  return key ? t(key) : undefined
}

function typeToneClass(baseType: string): string {
  return `is-tone-${structureDataTypeTone(baseType)}`
}

function typeTone(baseType: string): string {
  return typeToneClass(baseType)
}

function discard() {
  drafts.value = createColumnDrafts(props.columns, props.dbType)
  previewOpen.value = false
}

function addColumn() {
  if (!caps.value.addColumn) return
  const neu = createEmptyColumnDraft(props.dbType)
  drafts.value = insertColumnDraft(drafts.value, neu, selectedId.value)
  selectedId.value = neu.id
}

function duplicateColumn(draft: EditableColumnDraft) {
  if (!caps.value.addColumn) return
  const cloned = cloneColumnDraftAsNew(draft, props.dbType)
  drafts.value = insertColumnDraft(drafts.value, cloned, draft.id)
  selectedId.value = cloned.id
}

function removeOrRestore(draft: EditableColumnDraft) {
  if (draft.original && !caps.value.dropColumn && !draft.markedForDrop) return
  drafts.value = markOrRemoveColumn(drafts.value, draft.id)
}

async function copyAllNames() {
  const names = drafts.value
      .filter((d) => !d.markedForDrop && d.name.trim())
      .map((d) => d.name.trim())
  if (!names.length) return
  try {
    await navigator.clipboard.writeText(names.join('\n'))
  } catch {
    layout.showErrorToast(t('workspace.tableDetail.structureEditor.copyAllNamesFailed'))
  }
}

function onDragStart(id: string, event: DragEvent) {
  dragFromId.value = id
  event.dataTransfer?.setData('text/plain', id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}

function onDrop(toId: string, event: DragEvent) {
  event.preventDefault()
  const fromId = dragFromId.value || event.dataTransfer?.getData('text/plain')
  dragFromId.value = null
  if (!fromId || fromId === toId) return
  drafts.value = reorderColumnDrafts(drafts.value, fromId, toId)
}

function toggleGenerated(draft: EditableColumnDraft, enabled: boolean) {
  if (enabled) {
    draft.generated = draft.generated ?? {expression: '', storage: 'VIRTUAL'}
    draft.autoIncrement = false
    draft.onUpdateCurrentTimestamp = false
    draft.defaultValue = ''
  } else {
    draft.generated = null
  }
}

function openConfirm() {
  if (!applyEnabled.value) return
  if (hasUnsupportedPhysicalReorder(drafts.value, props.dbType)) {
    layout.showWarningToast(t('workspace.tableDetail.structureEditor.noPhysicalReorderToast'))
  }
  confirmOpen.value = true
}

async function applyChanges() {
  if (!props.connectionId || !pendingSql.value.trim()) return
  executing.value = true
  try {
    const result = await executeAlterColumnSql(pendingSql.value, {
      connectionId: props.connectionId,
      database: props.database,
      dbType: props.dbType,
    })
    if (!result.ok) {
      layout.showErrorToast(
          t('workspace.tableDetail.structureEditor.failedWithDetail', {message: result.message}),
      )
      return
    }
    confirmOpen.value = false
    emit('applied')
  } catch (error) {
    const message = resolveCaughtApiErrorMessage(
        error,
        t,
        'workspace.tableDetail.structureEditor.failed',
    )
    layout.showErrorToast(
        t('workspace.tableDetail.structureEditor.failedWithDetail', {message}),
    )
  } finally {
    executing.value = false
  }
}

function lineageLabel(name: string) {
  const counts = props.lineageCountsFor?.(name) ?? {upstream: 0, downstream: 0}
  return t('workspace.tableDetail.lightLineage.counts', {
    up: counts.upstream,
    down: counts.downstream,
  })
}
</script>

<template>
  <div class="structure-editor">
    <div class="structure-editor__toolbar">
      <div class="structure-editor__search-wrap">
        <DwIcon name="search" size="sm" class="structure-editor__search-icon" :stroke-width="2"/>
        <input
            v-model="search"
            type="search"
            class="structure-editor__search"
            :placeholder="t('workspace.tableDetail.structureEditor.search')"
        />
      </div>
      <div class="structure-editor__toolbar-actions">
        <button
            type="button"
            class="structure-editor__btn structure-editor__btn--primary"
            :disabled="!caps.addColumn"
            @click="addColumn"
        >
          <DwIcon name="plus" size="sm" :stroke-width="2.2"/>
          {{ t('workspace.tableDetail.structureEditor.addColumn') }}
        </button>
        <button
            type="button"
            class="structure-editor__btn"
            @click="copyAllNames"
        >
          {{ t('workspace.tableDetail.structureEditor.copyAllNames') }}
        </button>
        <button
            type="button"
            class="structure-editor__btn"
            :disabled="!dirty || executing"
            @click="discard"
        >
          {{ t('workspace.tableDetail.structureEditor.discard') }}
        </button>
        <button
            type="button"
            class="structure-editor__btn structure-editor__btn--accent"
            :class="{ 'is-busy': dirty }"
            :disabled="!applyEnabled"
            :title="canExecute === false ? executeDisabledHint : undefined"
            @click="openConfirm"
        >
          {{ executing
            ? t('workspace.tableDetail.structureEditor.applying')
            : t('workspace.tableDetail.structureEditor.apply') }}
        </button>
      </div>
    </div>

    <p
        v-if="!caps.reorderColumn"
        class="structure-editor__note"
    >
      {{ t('workspace.tableDetail.structureEditor.reorderLocalOnly') }}
    </p>

    <div class="structure-editor__grid-wrap">
      <table class="structure-editor__grid">
        <thead>
        <tr>
          <th class="col-narrow">#</th>
          <th class="col-actions">{{ t('workspace.tableDetail.structureEditor.actions') }}</th>
          <th class="col-name">{{ t('workspace.tableDetail.columnName') }}</th>
          <th v-if="lineageCountsFor" class="col-lineage">
            {{ t('workspace.tableDetail.lightLineage.column') }}
          </th>
          <th class="col-type">{{ t('workspace.tableDetail.dataType') }}</th>
          <th class="col-len">{{ t('workspace.tableDetail.length') }}</th>
          <th class="col-scale">{{ t('workspace.tableDetail.scale') }}</th>
          <th class="col-flag">{{ t('workspace.tableDetail.structureEditor.nullable') }}</th>
          <th v-if="caps.primaryKeyToggle" class="col-flag">
            {{ t('workspace.tableDetail.structureEditor.primaryKey') }}
          </th>
          <th class="col-default">{{ t('workspace.tableDetail.default') }}</th>
          <th class="col-comment">{{ t('workspace.tableDetail.comment') }}</th>
          <th v-if="caps.showCharacterSet" class="col-charset">
            {{ t('workspace.tableDetail.charset') }}
          </th>
          <th v-if="caps.showCharacterSet" class="col-collation">
            {{ t('workspace.tableDetail.collation') }}
          </th>
          <th v-if="caps.showExtendedAttrs" class="col-extra">
            {{ t('workspace.tableDetail.structureEditor.extendedAttrs') }}
          </th>
        </tr>
        </thead>
        <tbody>
        <tr
            v-for="(draft, index) in visibleDrafts"
            :key="draft.id"
            :class="{
              'is-selected': selectedId === draft.id,
              'is-dropped': draft.markedForDrop,
              'is-new': !draft.original,
              'is-pk': draft.primaryKey,
            }"
            @click="selectedId = draft.id"
            @dragover="onDragOver"
            @drop="onDrop(draft.id, $event)"
        >
          <td class="col-narrow col-muted">{{ index + 1 }}</td>
          <td class="col-actions">
            <div class="structure-editor__actions">
              <button
                  type="button"
                  class="structure-editor__icon-btn structure-editor__drag"
                  draggable="true"
                  :title="t('workspace.tableDetail.structureEditor.drag')"
                  @dragstart="onDragStart(draft.id, $event)"
                  @click.stop
              >
                <DwIcon name="grip-vertical" size="sm" :stroke-width="2"/>
              </button>
              <button
                  type="button"
                  class="structure-editor__icon-btn"
                  :title="t('workspace.tableDetail.structureEditor.duplicate')"
                  :disabled="!caps.addColumn || draft.markedForDrop"
                  @click.stop="duplicateColumn(draft)"
              >
                <DwIcon name="copy" size="sm" :stroke-width="2"/>
              </button>
              <button
                  type="button"
                  class="structure-editor__icon-btn structure-editor__icon-btn--danger"
                  :title="draft.markedForDrop
                    ? t('workspace.tableDetail.structureEditor.restore')
                    : t('workspace.tableDetail.structureEditor.delete')"
                  @click.stop="removeOrRestore(draft)"
              >
                <DwIcon name="delete" size="sm" :stroke-width="2"/>
              </button>
            </div>
          </td>
          <td class="col-name">
            <input
                v-model="draft.name"
                class="structure-editor__cell mono"
                :disabled="draft.markedForDrop || (!caps.renameColumn && !!draft.original)"
            />
          </td>
          <td v-if="lineageCountsFor" class="col-lineage">
            <button
                v-if="draft.original"
                type="button"
                class="structure-editor__lineage-btn"
                :class="{ 'is-active': lineageColumn === draft.original.name }"
                @click.stop="emit('toggle-lineage', draft.original.name)"
            >
              {{ lineageLabel(draft.original.name) }}
            </button>
            <button
                v-if="draft.original && showVectorFor?.(draft.original.dataType)"
                type="button"
                class="structure-editor__lineage-btn"
                @click.stop="emit('open-vector', draft.original.name)"
            >
              {{ t('workspace.tableDetail.vectorPreview.short') }}
            </button>
          </td>
          <td class="col-type" :class="typeTone(draft.baseType)">
            <DwSearchablePopup
                v-model="draft.baseType"
                variant="cell"
                allow-custom
                :options="dataTypeOptions"
                :disabled="draft.markedForDrop || !caps.alterType"
                :search-placeholder="t('workspace.tableDetail.structureEditor.selectOrType')"
                :empty-text="t('workspace.tableDetail.structureEditor.noMatches')"
                :option-help="typeHelp"
                :option-class="typeToneClass"
                :menu-min-width="200"
            />
          </td>
          <td class="col-len">
            <input
                v-model="draft.length"
                class="structure-editor__cell mono structure-editor__cell--num"
                inputmode="numeric"
                :disabled="draft.markedForDrop || !typeSupportsLength(draft.baseType) || !caps.alterType"
            />
          </td>
          <td class="col-scale">
            <input
                v-model="draft.scale"
                class="structure-editor__cell mono structure-editor__cell--num"
                inputmode="numeric"
                :disabled="draft.markedForDrop || !typeSupportsScale(draft.baseType) || !caps.alterType"
            />
          </td>
          <td class="col-flag col-center">
            <input
                v-model="draft.nullable"
                type="checkbox"
                class="structure-editor__check"
                :disabled="draft.markedForDrop || !caps.alterNullability || draft.primaryKey"
            />
          </td>
          <td v-if="caps.primaryKeyToggle" class="col-flag col-center">
            <input
                v-model="draft.primaryKey"
                type="checkbox"
                class="structure-editor__check"
                :disabled="draft.markedForDrop"
                @change="draft.primaryKey && (draft.nullable = false)"
            />
          </td>
          <td class="col-default">
            <DwSearchablePopup
                v-model="draft.defaultValue"
                variant="cell"
                allow-custom
                :options="defaultPresets"
                :disabled="draft.markedForDrop || !caps.alterDefault || !!draft.generated"
                :search-placeholder="t('workspace.tableDetail.structureEditor.selectOrType')"
                :empty-text="t('workspace.tableDetail.structureEditor.noMatches')"
                :menu-min-width="200"
            />
          </td>
          <td class="col-comment">
            <input
                v-model="draft.comment"
                class="structure-editor__cell"
                :disabled="draft.markedForDrop || !caps.comment"
            />
          </td>
          <td v-if="caps.showCharacterSet" class="col-charset">
            <DwSearchablePopup
                v-model="draft.characterSet"
                variant="cell"
                allow-custom
                :options="charsetOptions"
                :disabled="draft.markedForDrop"
                :search-placeholder="t('workspace.tableDetail.structureEditor.selectOrType')"
                :empty-text="t('workspace.tableDetail.structureEditor.noMatches')"
                :menu-min-width="180"
            />
          </td>
          <td v-if="caps.showCharacterSet" class="col-collation">
            <DwSearchablePopup
                v-model="draft.collation"
                variant="cell"
                allow-custom
                :options="collationOptionsFor(draft.characterSet)"
                :disabled="draft.markedForDrop"
                :search-placeholder="t('workspace.tableDetail.structureEditor.selectOrType')"
                :empty-text="t('workspace.tableDetail.structureEditor.noMatches')"
                :menu-min-width="200"
            />
          </td>
          <td v-if="caps.showExtendedAttrs" class="col-extra">
            <div class="structure-editor__extras">
              <label class="structure-editor__extra">
                <input
                    type="checkbox"
                    class="structure-editor__check"
                    :checked="!!draft.generated"
                    :disabled="draft.markedForDrop"
                    @change="toggleGenerated(draft, ($event.target as HTMLInputElement).checked)"
                />
                {{ t('workspace.tableDetail.structureEditor.virtual') }}
              </label>
              <label class="structure-editor__extra">
                <input
                    v-model="draft.autoIncrement"
                    type="checkbox"
                    class="structure-editor__check"
                    :disabled="draft.markedForDrop || !!draft.generated"
                />
                {{ t('workspace.tableDetail.structureEditor.autoIncrement') }}
              </label>
              <label class="structure-editor__extra">
                <input
                    v-model="draft.onUpdateCurrentTimestamp"
                    type="checkbox"
                    class="structure-editor__check"
                    :disabled="draft.markedForDrop || !!draft.generated"
                />
                {{ t('workspace.tableDetail.structureEditor.onUpdate') }}
              </label>
            </div>
            <template v-if="draft.generated">
              <input
                  v-model="draft.generated.expression"
                  class="structure-editor__cell mono structure-editor__generated"
                  :placeholder="t('workspace.tableDetail.structureEditor.generatedExpression')"
                  :disabled="draft.markedForDrop"
              />
              <select
                  v-model="draft.generated.storage"
                  class="structure-editor__cell structure-editor__select"
                  :disabled="draft.markedForDrop"
              >
                <option value="VIRTUAL">
                  {{ t('workspace.tableDetail.structureEditor.storageVirtual') }}
                </option>
                <option value="STORED">
                  {{ t('workspace.tableDetail.structureEditor.storageStored') }}
                </option>
              </select>
            </template>
          </td>
        </tr>
        <tr v-if="!visibleDrafts.length">
          <td :colspan="colSpan">
            <EmptyState embedded compact :title="t('workspace.tableDetail.emptySection')"/>
          </td>
        </tr>
        </tbody>
      </table>
    </div>

    <section class="structure-editor__preview" :class="{ 'is-open': previewOpen || dirty }">
      <button
          type="button"
          class="structure-editor__preview-toggle"
          @click="previewOpen = !previewOpen"
      >
        <span>{{ t('workspace.tableDetail.structureEditor.previewToggle') }}</span>
        <span v-if="dirty && pendingSql.trim()" class="structure-editor__preview-badge">
          {{ pendingSql.trim().split('\n').filter(Boolean).length }}
        </span>
        <DwIcon
            name="chevron-down"
            size="sm"
            class="structure-editor__preview-chevron"
            :class="{ 'is-open': previewOpen || dirty }"
            :stroke-width="2"
        />
      </button>
      <div v-if="previewOpen || dirty" class="structure-editor__preview-body">
        <pre v-if="pendingSql.trim()">{{ pendingSql }}</pre>
        <p v-else class="structure-editor__preview-empty">
          {{ t('workspace.tableDetail.structureEditor.previewEmpty') }}
        </p>
      </div>
    </section>

    <AppModal
        :open="confirmOpen"
        :title="t('workspace.tableDetail.structureEditor.confirmTitle')"
        width="640px"
        @close="confirmOpen = false"
    >
      <DwConfirmAlert
          :variant="productionEnv ? 'danger' : 'warning'"
          :message="t('workspace.tableDetail.structureEditor.confirmApply')"
          :hint="productionEnv ? t('workspace.tableDetail.alterColumn.confirmProd') : null"
      />
      <section class="structure-editor__confirm-sql">
        <header>{{ t('workspace.tableDetail.alterColumn.preview') }}</header>
        <pre>{{ pendingSql }}</pre>
      </section>
      <template #footer>
        <ModalActions
            :confirm-label="t('workspace.tableDetail.alterColumn.executeConfirm')"
            :confirm-variant="productionEnv ? 'danger' : 'primary'"
            :confirm-loading="executing"
            @cancel="confirmOpen = false"
            @confirm="applyChanges"
        />
      </template>
    </AppModal>
  </div>
</template>

<style scoped>
.structure-editor {
  --se-row-h: 32px;
  --se-font: 12.5px;
  --se-cell-px: 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  flex: 1;
}

.structure-editor__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.structure-editor__search-wrap {
  position: relative;
  display: flex;
  align-items: center;
  margin-right: auto;
}

.structure-editor__search-icon {
  position: absolute;
  left: 8px;
  color: var(--dw-text-muted);
  pointer-events: none;
}

.structure-editor__search {
  width: 220px;
  height: 28px;
  padding: 0 10px 0 28px;
  border: 1px solid var(--dw-border);
  border-radius: 6px;
  background: var(--dw-bg-panel);
  color: var(--dw-text-primary);
  font-size: var(--se-font);
}

.structure-editor__search:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--dw-primary) 55%, var(--dw-border));
}

.structure-editor__toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.structure-editor__btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--dw-border);
  border-radius: 6px;
  background: transparent;
  color: var(--dw-text-secondary);
  font-size: var(--se-font);
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}

.structure-editor__btn:hover:not(:disabled) {
  color: var(--dw-text-primary);
  background: color-mix(in srgb, var(--dw-bg-muted) 55%, transparent);
}

.structure-editor__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.structure-editor__btn--primary {
  border-color: color-mix(in srgb, var(--dw-text-primary) 28%, var(--dw-border));
  background: var(--dw-text-primary);
  color: var(--dw-bg-panel);
}

.structure-editor__btn--primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--dw-text-primary) 88%, white);
  color: var(--dw-bg-panel);
}

.structure-editor__btn--accent.is-busy:not(:disabled) {
  border-color: var(--dw-primary);
  background: var(--dw-primary);
  color: #fff;
}

.structure-editor__btn--accent.is-busy:hover:not(:disabled) {
  background: color-mix(in srgb, var(--dw-primary) 88%, black);
  color: #fff;
}

.structure-editor__note {
  margin: 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  line-height: 1.4;
}

.structure-editor__grid-wrap {
  flex: 1;
  min-height: 200px;
  overflow: auto;
  border: 1px solid var(--dw-border-light);
  border-radius: 8px;
  background: var(--dw-bg-editor);
}

.structure-editor__grid {
  width: max-content;
  min-width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--se-font);
  table-layout: fixed;
}

.structure-editor__grid th,
.structure-editor__grid td {
  height: var(--se-row-h);
  padding: 0 var(--se-cell-px);
  border-bottom: 1px solid var(--dw-border-light);
  border-right: 1px solid color-mix(in srgb, var(--dw-border-light) 70%, transparent);
  vertical-align: middle;
  white-space: nowrap;
}

.structure-editor__grid th:last-child,
.structure-editor__grid td:last-child {
  border-right: none;
}

.structure-editor__grid th {
  position: sticky;
  top: 0;
  z-index: 2;
  height: 30px;
  background: color-mix(in srgb, var(--dw-wb-card-bg) 92%, var(--dw-bg-muted));
  color: var(--dw-text-muted);
  font-weight: 600;
  font-size: var(--dw-text-xs);
  letter-spacing: 0.02em;
  text-align: left;
}

.structure-editor__grid tbody tr {
  background: transparent;
}

.structure-editor__grid tbody tr:hover td {
  background: color-mix(in srgb, var(--dw-bg-muted) 40%, transparent);
}

.structure-editor__grid tbody tr.is-selected td {
  background: color-mix(in srgb, var(--dw-primary) 7%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--dw-primary) 45%, transparent),
    inset 0 -1px 0 color-mix(in srgb, var(--dw-primary) 45%, transparent);
}

.structure-editor__grid tbody tr.is-selected td:first-child {
  box-shadow: inset 2px 0 0 var(--dw-primary),
    inset 0 1px 0 color-mix(in srgb, var(--dw-primary) 45%, transparent),
    inset 0 -1px 0 color-mix(in srgb, var(--dw-primary) 45%, transparent);
}

.structure-editor__grid tbody tr.is-pk td:first-child {
  box-shadow: inset 3px 0 0 #d97706;
}

.structure-editor__grid tbody tr.is-pk.is-selected td:first-child {
  box-shadow: inset 3px 0 0 #d97706,
    inset 0 1px 0 color-mix(in srgb, var(--dw-primary) 45%, transparent),
    inset 0 -1px 0 color-mix(in srgb, var(--dw-primary) 45%, transparent);
}

.structure-editor__grid tbody tr.is-dropped {
  opacity: 0.42;
}

.structure-editor__grid tbody tr.is-dropped td {
  text-decoration: line-through;
  text-decoration-color: color-mix(in srgb, var(--dw-text-muted) 60%, transparent);
}

.structure-editor__grid tbody tr.is-new .col-name .structure-editor__cell {
  color: var(--dw-primary);
  font-weight: 600;
}

.structure-editor__grid td:focus-within {
  outline: 1px solid color-mix(in srgb, var(--dw-primary) 55%, transparent);
  outline-offset: -1px;
  background: color-mix(in srgb, var(--dw-primary) 6%, transparent);
}

/* Spreadsheet cells — no pill borders */
.structure-editor__cell,
.structure-editor__select {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 26px;
  margin: 0;
  padding: 0 4px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--dw-text-primary);
  font-size: var(--se-font);
  outline: none;
}

.structure-editor__cell:disabled,
.structure-editor__select:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.structure-editor__cell.mono {
  font-family: var(--dw-font-mono, ui-monospace, monospace);
}

.structure-editor__cell--num {
  width: 56px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.structure-editor__check {
  margin: 0;
  cursor: pointer;
  accent-color: var(--dw-primary);
}

.col-narrow {
  width: 36px;
  min-width: 36px;
  text-align: center;
}

.col-actions {
  width: 88px;
  min-width: 88px;
}

.col-name {
  width: 140px;
  min-width: 120px;
}

.col-lineage {
  width: 72px;
  min-width: 64px;
}

.col-type {
  width: 128px;
  min-width: 110px;
}

.col-len,
.col-scale {
  width: 64px;
  min-width: 56px;
}

.col-flag {
  width: 56px;
  min-width: 48px;
  text-align: center;
}

.col-default {
  width: 140px;
  min-width: 100px;
}

.col-comment {
  width: 160px;
  min-width: 120px;
}

.col-charset,
.col-collation {
  width: 110px;
  min-width: 90px;
}

.col-extra {
  width: 280px;
  min-width: 240px;
  white-space: normal;
}

.col-center {
  text-align: center;
}

.col-muted {
  color: var(--dw-text-muted);
  font-variant-numeric: tabular-nums;
}

.structure-editor__actions {
  display: inline-flex;
  align-items: center;
  gap: 1px;
}

.structure-editor__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: color-mix(in srgb, var(--dw-text-primary) 72%, var(--dw-text-muted));
  opacity: 0.78;
  cursor: pointer;
}

.structure-editor__drag {
  cursor: grab;
}

.structure-editor__drag:active {
  cursor: grabbing;
}

.structure-editor__grid tbody tr:hover .structure-editor__icon-btn,
.structure-editor__grid tbody tr.is-selected .structure-editor__icon-btn {
  opacity: 1;
  color: var(--dw-text-primary);
}

.structure-editor__icon-btn:hover:not(:disabled) {
  color: var(--dw-text-primary);
  background: color-mix(in srgb, var(--dw-bg-muted) 80%, transparent);
  opacity: 1;
}

.structure-editor__drag:hover:not(:disabled) {
  background: color-mix(in srgb, var(--dw-bg-muted) 90%, transparent);
}

.structure-editor__icon-btn--danger:hover:not(:disabled) {
  color: #ef4444;
  background: color-mix(in srgb, #ef4444 14%, transparent);
}

.structure-editor__icon-btn:disabled {
  opacity: 0.28;
  cursor: not-allowed;
}

.structure-editor__lineage-btn {
  border: none;
  background: transparent;
  color: var(--dw-text-muted);
  cursor: pointer;
  padding: 1px 3px;
  border-radius: 3px;
  font-size: var(--dw-text-xs);
}

.structure-editor__lineage-btn:hover,
.structure-editor__lineage-btn.is-active {
  color: var(--dw-primary);
  background: var(--dw-primary-soft);
}

/* Trigger inherits cell tone; list tones live on teleported DwSearchablePopup labels. */
.col-type :deep(.dw-sp__value) {
  color: var(--se-type-color, var(--dw-text-primary));
}

.col-type.is-tone-text,
.col-type.is-tone-json {
  --se-type-color: #16a34a;
}

.col-type.is-tone-numeric,
.col-type.is-tone-boolean {
  --se-type-color: #2563eb;
}

.col-type.is-tone-real {
  --se-type-color: #6366f1;
}

.col-type.is-tone-temporal {
  --se-type-color: #d97706;
}

.col-type.is-tone-binary {
  --se-type-color: #9333ea;
}

.col-type.is-tone-enum,
.col-type.is-tone-other {
  --se-type-color: #78716c;
}

.col-type.is-tone-spatial {
  --se-type-color: #0e7490;
}

:root.dark .col-type.is-tone-text,
:root.dark .col-type.is-tone-json,
[data-theme='dark'] .col-type.is-tone-text,
[data-theme='dark'] .col-type.is-tone-json {
  --se-type-color: #86efac;
}

:root.dark .col-type.is-tone-numeric,
:root.dark .col-type.is-tone-boolean,
[data-theme='dark'] .col-type.is-tone-numeric,
[data-theme='dark'] .col-type.is-tone-boolean {
  --se-type-color: #93c5fd;
}

:root.dark .col-type.is-tone-real,
[data-theme='dark'] .col-type.is-tone-real {
  --se-type-color: #a5b4fc;
}

:root.dark .col-type.is-tone-temporal,
[data-theme='dark'] .col-type.is-tone-temporal {
  --se-type-color: #fcd34d;
}

:root.dark .col-type.is-tone-binary,
[data-theme='dark'] .col-type.is-tone-binary {
  --se-type-color: #d8b4fe;
}

:root.dark .col-type.is-tone-enum,
:root.dark .col-type.is-tone-other,
[data-theme='dark'] .col-type.is-tone-enum,
[data-theme='dark'] .col-type.is-tone-other {
  --se-type-color: #d4d486;
}

:root.dark .col-type.is-tone-spatial,
[data-theme='dark'] .col-type.is-tone-spatial {
  --se-type-color: #67e8f9;
}

.structure-editor__extras {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 10px;
}

.structure-editor__extra {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-secondary);
  white-space: nowrap;
  cursor: pointer;
}

.structure-editor__generated {
  margin-top: 4px;
  display: block;
  border-bottom: 1px dashed var(--dw-border) !important;
}

.structure-editor__preview {
  border: 1px solid var(--dw-border-light);
  border-radius: 8px;
  background: var(--dw-bg-panel);
  overflow: hidden;
  flex-shrink: 0;
}

.structure-editor__preview-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  border: none;
  background: transparent;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}

.structure-editor__preview-toggle:hover {
  color: var(--dw-text-primary);
  background: color-mix(in srgb, var(--dw-bg-muted) 40%, transparent);
}

.structure-editor__preview-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 16px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--dw-primary-soft);
  color: var(--dw-primary);
  font-size: var(--dw-font-size-badge);
  font-weight: 700;
}

.structure-editor__preview-chevron {
  margin-left: auto;
  transition: transform 0.15s ease;
}

.structure-editor__preview-chevron.is-open {
  transform: rotate(180deg);
}

.structure-editor__preview-body {
  border-top: 1px solid var(--dw-border-light);
}

.structure-editor__preview-body pre,
.structure-editor__confirm-sql pre {
  margin: 0;
  padding: 10px 12px;
  max-height: 140px;
  overflow: auto;
  font-family: var(--dw-font-mono, ui-monospace, monospace);
  font-size: var(--dw-text-xs);
  line-height: 1.45;
  white-space: pre-wrap;
  color: var(--dw-text-secondary);
}

.structure-editor__preview-empty {
  margin: 0;
  padding: 10px 12px;
  color: var(--dw-text-muted);
  font-size: var(--se-font);
}

.structure-editor__confirm-sql {
  margin-top: var(--dw-space-4);
  border: 1px solid var(--dw-border-light);
  border-radius: 8px;
  overflow: hidden;
}

.structure-editor__confirm-sql header {
  padding: 6px 10px;
  border-bottom: 1px solid var(--dw-border-light);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  font-weight: 600;
}
</style>
