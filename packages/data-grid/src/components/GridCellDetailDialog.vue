<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {AppModal} from '@datawise/overlays'
import {DwButton, DwInlineAlert, DwInput, useDwI18n} from '@datawise/ui'
import {
  formatJsonEditorText,
  validateJsonEditorText,
  type GridCellEditorKind,
} from '../services/grid-cell-json.service'
import {
  bytesToDataUrl,
  bytesToHexDump,
  decodeBinaryCellContent,
  detectImageMimeFromBytes,
} from '../services/cell-binary-preview.service'
import {
  DEFAULT_GRID_CELL_DETAIL_LABELS,
  formatGridCellDetailLabel,
  type GridCellDetailLabels,
} from './grid-cell-detail.types'

const props = withDefaults(
  defineProps<{
    open: boolean
    columnName: string
    rowLabel: string
    content: string
    title?: string
    editable?: boolean
    editorKind?: GridCellEditorKind
    labels?: Partial<GridCellDetailLabels>
  }>(),
  {
    editable: false,
    editorKind: 'longText',
  },
)

const emit = defineEmits<{
  close: []
  apply: [value: string]
}>()

const t = useDwI18n()
const copied = ref(false)
const draft = ref('')
const jsonError = ref(false)
const binaryView = ref<'hex' | 'image' | 'raw'>('hex')

const labels = computed<GridCellDetailLabels>(() => ({
  ...DEFAULT_GRID_CELL_DETAIL_LABELS,
  close: t('common.close'),
  ...props.labels,
}))

const isJsonEditor = computed(() => props.editorKind === 'json')
const isBinaryPreview = computed(() => props.editorKind === 'binary')
const canEdit = computed(() => props.editable && !isBinaryPreview.value)
const charCount = computed(() => (canEdit.value ? draft.value : props.content).length)
const isEmpty = computed(() => !(canEdit.value ? draft.value : props.content))

const binaryBytes = computed(() =>
  isBinaryPreview.value ? decodeBinaryCellContent(props.content) : null,
)
const binaryHexDump = computed(() =>
  binaryBytes.value ? bytesToHexDump(binaryBytes.value) : '',
)
const binaryImageMime = computed(() =>
  binaryBytes.value ? detectImageMimeFromBytes(binaryBytes.value) : null,
)
const binaryImageUrl = computed(() => {
  if (!binaryBytes.value || !binaryImageMime.value) return null
  return bytesToDataUrl(binaryBytes.value, binaryImageMime.value)
})
const binaryByteLength = computed(() => binaryBytes.value?.length ?? 0)

const modalTitle = computed(() =>
  props.title
    || formatGridCellDetailLabel(labels.value.titleTemplate, {column: props.columnName}),
)

const metaCountLabel = computed(() =>
  isBinaryPreview.value
    ? formatGridCellDetailLabel(labels.value.bytes, {count: binaryByteLength.value})
    : formatGridCellDetailLabel(labels.value.chars, {count: charCount.value}),
)

const binaryImageAlt = computed(() =>
  formatGridCellDetailLabel(labels.value.binaryImageAlt, {column: props.columnName}),
)

watch(
  () => [props.open, props.content, props.editorKind] as const,
  ([open]) => {
    if (!open) {
      copied.value = false
      jsonError.value = false
      return
    }
    draft.value = props.content
    jsonError.value = false
    binaryView.value = binaryImageMime.value ? 'image' : 'hex'
  },
  {immediate: true},
)

async function onCopy() {
  const text = canEdit.value ? draft.value : props.content
  if (!text) return
  await navigator.clipboard.writeText(text)
  copied.value = true
}

function onFormatJson() {
  if (!isJsonEditor.value) return
  if (validateJsonEditorText(draft.value)) {
    jsonError.value = true
    return
  }
  try {
    draft.value = formatJsonEditorText(draft.value)
    jsonError.value = false
  } catch {
    jsonError.value = true
  }
}

function onApply() {
  if (!canEdit.value) return
  if (isJsonEditor.value) {
    if (validateJsonEditorText(draft.value)) {
      jsonError.value = true
      return
    }
    try {
      emit('apply', formatJsonEditorText(draft.value))
      return
    } catch {
      jsonError.value = true
      return
    }
  }
  emit('apply', draft.value)
}
</script>

<template>
  <AppModal
      :open="open"
      :title="modalTitle"
      :subtitle="rowLabel"
      width="min(640px, 92vw)"
      max-height="80vh"
      @close="emit('close')"
  >
    <div class="cell-detail">
      <DwInlineAlert
          v-if="jsonError"
          density="banner"
          variant="error"
          :message="labels.invalidJson"
      />
      <p v-if="isBinaryPreview" class="cell-detail__hint">
        {{ labels.binaryHint }}
      </p>

      <div class="cell-detail__meta">
        <span class="cell-detail__meta-item">{{ columnName }}</span>
        <span class="cell-detail__meta-dot" aria-hidden="true">·</span>
        <span class="cell-detail__meta-item">{{ rowLabel }}</span>
        <span class="cell-detail__meta-spacer"/>
        <span class="cell-detail__meta-item cell-detail__meta-item--muted">
          {{ metaCountLabel }}
        </span>
      </div>

      <div v-if="isBinaryPreview" class="cell-detail__binary-tabs" role="tablist">
        <button
            type="button"
            role="tab"
            class="cell-detail__binary-tab"
            :class="{ 'is-active': binaryView === 'hex' }"
            :aria-selected="binaryView === 'hex'"
            @click="binaryView = 'hex'"
        >
          {{ labels.binaryHex }}
        </button>
        <button
            v-if="binaryImageUrl"
            type="button"
            role="tab"
            class="cell-detail__binary-tab"
            :class="{ 'is-active': binaryView === 'image' }"
            :aria-selected="binaryView === 'image'"
            @click="binaryView = 'image'"
        >
          {{ labels.binaryImage }}
        </button>
        <button
            type="button"
            role="tab"
            class="cell-detail__binary-tab"
            :class="{ 'is-active': binaryView === 'raw' }"
            :aria-selected="binaryView === 'raw'"
            @click="binaryView = 'raw'"
        >
          {{ labels.binaryRaw }}
        </button>
      </div>

      <DwInput
          v-if="canEdit"
          v-model="draft"
          class="cell-detail__editor"
          :class="{ 'cell-detail__editor--json': isJsonEditor }"
          multiline
          :rows="12"
          :spellcheck="false"
      />
      <div v-else-if="isBinaryPreview" class="cell-detail__viewer cell-detail__viewer--binary">
        <p v-if="isEmpty" class="cell-detail__empty">{{ labels.nullValue }}</p>
        <img
            v-else-if="binaryView === 'image' && binaryImageUrl"
            class="cell-detail__image"
            :src="binaryImageUrl"
            :alt="binaryImageAlt"
        >
        <pre v-else-if="binaryView === 'hex' && binaryHexDump" class="cell-detail__content cell-detail__content--mono">{{ binaryHexDump }}</pre>
        <pre v-else class="cell-detail__content cell-detail__content--mono">{{ content }}</pre>
      </div>
      <div v-else class="cell-detail__viewer">
        <p v-if="isEmpty" class="cell-detail__empty">{{ labels.nullValue }}</p>
        <pre
            v-else
            class="cell-detail__content"
            :class="{ 'cell-detail__content--mono': isJsonEditor }"
        >{{ content }}</pre>
      </div>
    </div>

    <template #footer>
      <DwButton v-if="isJsonEditor && canEdit" variant="ghost" type="button" @click="onFormatJson">
        {{ labels.formatJson }}
      </DwButton>
      <DwButton variant="ghost" type="button" @click="emit('close')">
        {{ labels.close }}
      </DwButton>
      <DwButton
          variant="secondary"
          type="button"
          :disabled="isEmpty"
          @click="onCopy"
      >
        {{ copied ? labels.copied : labels.copy }}
      </DwButton>
      <DwButton v-if="canEdit" variant="primary" type="button" @click="onApply">
        {{ labels.apply }}
      </DwButton>
    </template>
  </AppModal>
</template>

<style scoped>
.cell-detail {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-4);
  min-height: 0;
}

.cell-detail__hint {
  margin: 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.cell-detail__meta {
  display: flex;
  align-items: center;
  gap: var(--dw-space-2);
  min-width: 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-secondary);
}

.cell-detail__meta-item {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell-detail__meta-item--muted {
  color: var(--dw-text-muted);
  flex-shrink: 0;
}

.cell-detail__meta-dot {
  color: var(--dw-text-muted);
  flex-shrink: 0;
}

.cell-detail__meta-spacer {
  flex: 1;
  min-width: var(--dw-space-3);
}

.cell-detail__editor,
.cell-detail__viewer,
:deep(.cell-detail__editor) {
  width: 100%;
  min-height: 220px;
  max-height: 48vh;
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background: var(--dw-surface-muted, var(--dw-bg-elevated, var(--dw-bg-panel)));
  color: var(--dw-text-primary);
}

.cell-detail__editor,
:deep(.cell-detail__editor) {
  padding: var(--dw-space-5);
  font-size: var(--dw-text-sm);
  font-family: var(--dw-font-sans, inherit);
  line-height: 1.6;
  resize: vertical;
}

.cell-detail__editor--json,
:deep(.cell-detail__editor--json) {
  font-family: var(--dw-mono);
  tab-size: 2;
}

.cell-detail__viewer {
  overflow: auto;
  padding: var(--dw-space-5);
}

.cell-detail__viewer--binary {
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

.cell-detail__binary-tabs {
  display: flex;
  gap: var(--dw-space-1);
}

.cell-detail__binary-tab {
  padding: 2px var(--dw-space-3);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius-sm);
  background: transparent;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  cursor: pointer;
}

.cell-detail__binary-tab.is-active {
  border-color: color-mix(in srgb, var(--dw-primary) 45%, var(--dw-border-light));
  color: var(--dw-primary);
  background: color-mix(in srgb, var(--dw-primary) 8%, transparent);
}

.cell-detail__image {
  max-width: 100%;
  max-height: 42vh;
  object-fit: contain;
  border-radius: var(--dw-control-radius-sm);
}

.cell-detail__content {
  margin: 0;
  font-size: var(--dw-text-sm);
  font-family: var(--dw-font-sans, inherit);
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--dw-text-primary);
}

.cell-detail__content--mono {
  font-family: var(--dw-mono);
  white-space: pre;
  word-break: normal;
}

.cell-detail__empty {
  margin: 0;
  font-size: var(--dw-text-sm);
  color: var(--dw-text-muted);
  font-style: italic;
}
</style>
