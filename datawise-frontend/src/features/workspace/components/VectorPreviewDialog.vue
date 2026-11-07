<script setup lang="ts">
import {ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, ModalActions} from '@/core/components'
import type {DbType} from '@/core/types'
import {
    DEFAULT_VECTOR_PREVIEW_LIMIT,
    buildVectorPreviewSql,
    supportsVectorPreview,
} from '@/features/workspace/services/vector-preview-sql.service'

const props = defineProps<{
    open: boolean
    dbType?: DbType
    database?: string
    tableName: string
    columnName: string
}>()

const emit = defineEmits<{
    close: []
    'open-sql': [sql: string]
}>()

const {t} = useI18n()
const vectorText = ref('')
const limit = ref(DEFAULT_VECTOR_PREVIEW_LIMIT)
const error = ref('')

watch(
    () => props.open,
    (open) => {
        if (!open) return
        vectorText.value = ''
        limit.value = DEFAULT_VECTOR_PREVIEW_LIMIT
        error.value = ''
    },
)

function submit() {
    if (!supportsVectorPreview(props.dbType)) {
        error.value = t('workspace.tableDetail.vectorPreview.unsupported')
        return
    }
    const sql = buildVectorPreviewSql({
        dbType: props.dbType,
        database: props.database,
        tableName: props.tableName,
        columnName: props.columnName,
        vectorText: vectorText.value,
        limit: limit.value,
    })
    if (!sql) {
        error.value = t('workspace.tableDetail.vectorPreview.invalid')
        return
    }
    emit('open-sql', sql)
}
</script>

<template>
  <AppModal
      :open="open"
      :title="t('workspace.tableDetail.vectorPreview.title')"
      @close="emit('close')"
  >
    <p class="vector-preview__hint">
      {{ t('workspace.tableDetail.vectorPreview.hint', {column: columnName}) }}
    </p>
    <label class="vector-preview__label">
      {{ t('workspace.tableDetail.vectorPreview.vector') }}
      <textarea
          v-model="vectorText"
          class="vector-preview__input"
          rows="4"
          :placeholder="t('workspace.tableDetail.vectorPreview.placeholder')"
      />
    </label>
    <label class="vector-preview__label">
      {{ t('workspace.tableDetail.vectorPreview.limit') }}
      <input v-model.number="limit" class="vector-preview__limit" type="number" min="1" max="200">
    </label>
    <p v-if="error" class="vector-preview__error">{{ error }}</p>
    <template #footer>
      <ModalActions
          :confirm-label="t('workspace.tableDetail.vectorPreview.openSql')"
          @cancel="emit('close')"
          @confirm="submit"
      />
    </template>
  </AppModal>
</template>

<style scoped>
.vector-preview__hint {
  margin: 0 0 var(--dw-space-3);
  font-size: var(--dw-text-sm);
  color: var(--dw-text-muted);
}

.vector-preview__label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: var(--dw-space-3);
  font-size: var(--dw-text-xs);
  color: var(--dw-text-secondary);
}

.vector-preview__input,
.vector-preview__limit {
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--dw-text) 16%, transparent);
  border-radius: var(--dw-control-radius);
  background: transparent;
  color: var(--dw-text);
  font-family: var(--dw-mono);
  font-size: var(--dw-text-sm);
  padding: 8px;
}

.vector-preview__limit {
  max-width: 120px;
}

.vector-preview__error {
  margin: 0 0 var(--dw-space-3);
  color: var(--dw-danger);
  font-size: var(--dw-text-xs);
}
</style>
