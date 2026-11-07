<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import type {TableColumn, TableRow} from '@/core/types'
import type {SqlReviewFinding} from '@/features/platform/types/platform.types'
import type {DangerousSqlPreview} from '@/features/workspace/services/dangerous-sql-preview.service'
import {useProjectStore} from '@/features/project/stores/project'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {DwButton, DwCheckbox} from '@/core/components'
import {DwIcon} from '@/core/icons'

const props = defineProps<{
  sql?: string | null
  preview: DangerousSqlPreview | null
  loading: boolean
  affectedCount: number | null
  sampleRows: TableRow[]
  sampleColumns: TableColumn[]
  errorMessage: string | null
  productionForced?: boolean
  productionApprovalRequired?: boolean
  sqlReviewFindings?: SqlReviewFinding[]
  sqlReviewBlocked?: boolean
  sqlReviewSuggestedSql?: string | null
  sqlReviewRewriteNote?: string | null
  sqlReviewRewriteLoading?: boolean
}>()

const emit = defineEmits<{
  applySuggestedSql: []
}>()

const {t} = useI18n()
const projectStore = useProjectStore()
const appConfig = useAppConfigStore()
const projectName = computed(() => projectStore.displayName)
const copied = ref(false)
const suppressFuture = ref(false)

const kindLabel = computed(() => {
  const kind = props.preview?.kind
  if (!kind) return ''
  return t(`console.dangerousSql.kind.${kind}`)
})

const statusMessage = computed(() => {
  if (props.loading) return t('console.dangerousSql.loading')
  if (props.errorMessage) return props.errorMessage
  if (props.preview?.fullTableRisk && props.affectedCount == null) {
    return t('console.dangerousSql.fullTableRisk')
  }
  if (props.affectedCount != null) {
    return t('console.dangerousSql.affectedRows', {count: props.affectedCount})
  }
  return t('console.dangerousSql.confirmHint')
})

const showSqlPreview = computed(() => Boolean(props.sql?.trim()))
const showSuppress = computed(() =>
    !props.productionForced && !props.productionApprovalRequired,
)
const samplePreviewRows = computed(() => props.sampleRows.slice(0, 5))
const showSample = computed(() =>
    samplePreviewRows.value.length > 0 && props.sampleColumns.length > 0,
)

async function copySql() {
  const text = props.sql?.trim()
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    window.setTimeout(() => {
      copied.value = false
    }, 1600)
  } catch {
    copied.value = false
  }
}

function onSuppressChange(checked: boolean | undefined) {
  const next = Boolean(checked)
  suppressFuture.value = next
  appConfig.patchDangerousSql({confirmEnabled: !next})
}

function cellText(row: TableRow, column: TableColumn): string {
  const key = column.key || column.name
  const value = row[key]
  if (value == null) return 'NULL'
  return String(value)
}
</script>

<template>
  <div class="dangerous-pending" role="status" aria-live="polite">
    <p v-if="productionApprovalRequired" class="dangerous-pending__prod">
      {{ t('console.productionApproval.pendingHint', {project: projectName}) }}
    </p>
    <p v-else-if="productionForced" class="dangerous-pending__prod">
      {{ t('console.dangerousSql.prodForced', {project: projectName}) }}
    </p>
    <div class="dangerous-pending__body">
      <span class="dangerous-pending__badge">{{ kindLabel }}</span>
      <span v-if="preview?.tableName" class="dangerous-pending__table">
        {{ t('console.dangerousSql.table', {name: preview.tableName}) }}
      </span>
      <span class="dangerous-pending__hint">{{ statusMessage }}</span>
    </div>

    <div v-if="showSqlPreview" class="dangerous-pending__sql-block">
      <div class="dangerous-pending__sql-head">
        <span>{{ t('console.dangerousSql.statement') }}</span>
        <DwButton variant="ghost" size="sm" @click="copySql">
          <DwIcon :name="copied ? 'check' : 'copy'" size="sm" :stroke-width="2"/>
          {{ copied ? t('console.dangerousSql.copied') : t('console.dangerousSql.copy') }}
        </DwButton>
      </div>
      <pre class="dangerous-pending__sql">{{ sql }}</pre>
    </div>

    <div v-if="showSample" class="dangerous-pending__sample">
      <div class="dangerous-pending__sample-title">
        {{ t('console.dangerousSql.sampleTitle') }}
        <span class="dangerous-pending__sample-count">
          {{ t('console.dangerousSql.sampleCount', {count: samplePreviewRows.length}) }}
        </span>
      </div>
      <div class="dangerous-pending__sample-scroll">
        <table>
          <thead>
            <tr>
              <th v-for="col in sampleColumns" :key="col.key || col.name">
                {{ col.name || col.key }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, rowIndex) in samplePreviewRows" :key="rowIndex">
              <td v-for="col in sampleColumns" :key="col.key || col.name">
                {{ cellText(row, col) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <DwCheckbox
        v-if="showSuppress"
        v-model="suppressFuture"
        class="dangerous-pending__suppress"
        @update:model-value="onSuppressChange"
    >
      {{ t('console.dangerousSql.suppressFuture') }}
    </DwCheckbox>

    <ul v-if="sqlReviewFindings?.length" class="dangerous-pending__review">
      <li class="dangerous-pending__review-title">{{ t('platform.sqlReview.title') }}</li>
      <li v-if="sqlReviewBlocked" class="dangerous-pending__review-blocked">
        {{ t('platform.sqlReview.blocked') }}
      </li>
      <li
          v-for="(finding, index) in sqlReviewFindings"
          :key="`${finding.code}-${index}`"
          class="dangerous-pending__finding"
      >
        <strong>[{{ finding.severity }}]</strong> {{ finding.message }}
        <span v-if="finding.suggestion" class="dangerous-pending__suggestion">{{ finding.suggestion }}</span>
      </li>
    </ul>
    <div v-if="sqlReviewSuggestedSql?.trim()" class="dangerous-pending__rewrite">
      <p class="dangerous-pending__rewrite-note">
        {{ sqlReviewRewriteNote || t('platform.sqlReview.rewriteReady') }}
      </p>
      <pre class="dangerous-pending__rewrite-sql">{{ sqlReviewSuggestedSql }}</pre>
      <button
          type="button"
          class="dw-text-btn dw-text-btn--accent"
          :disabled="sqlReviewRewriteLoading"
          @click="emit('applySuggestedSql')"
      >
        {{ t('platform.sqlReview.applyRewrite') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.dangerous-pending {
  flex-shrink: 0;
  padding: var(--dw-space-3) var(--dw-space-6);
  border-bottom: 1px solid var(--dw-border-light);
  background: color-mix(in srgb, var(--dw-warning) 8%, var(--dw-bg-panel));
}

.dangerous-pending__prod {
  margin: 0 0 var(--dw-space-2);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  color: var(--dw-danger);
}

.dangerous-pending__body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-gap);
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading);
}

.dangerous-pending__badge {
  padding: 1px var(--dw-space-3);
  border-radius: var(--dw-control-radius-sm);
  font-size: var(--dw-text-xs);
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--dw-danger);
  background: color-mix(in srgb, var(--dw-danger) 12%, transparent);
}

.dangerous-pending__table {
  color: var(--dw-text-muted);
}

.dangerous-pending__hint {
  color: var(--dw-text);
}

.dangerous-pending__sql-block {
  margin-top: var(--dw-space-3);
}

.dangerous-pending__sql-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap);
  margin-bottom: var(--dw-space-2);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  color: var(--dw-text-secondary);
}

.dangerous-pending__sql {
  margin: 0;
  padding: var(--dw-pad-tight);
  border-radius: var(--dw-control-radius-sm);
  border: 1px solid color-mix(in srgb, var(--dw-danger) 18%, var(--dw-border-light));
  background: var(--dw-bg-subtle);
  color: var(--dw-text);
  font-family: var(--dw-mono);
  font-size: var(--dw-text-xs);
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 140px;
  overflow: auto;
}

.dangerous-pending__sample {
  margin-top: var(--dw-space-3);
}

.dangerous-pending__sample-title {
  display: flex;
  align-items: baseline;
  gap: var(--dw-gap-sm);
  margin-bottom: var(--dw-space-2);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  color: var(--dw-text-secondary);
}

.dangerous-pending__sample-count {
  font-weight: 400;
  color: var(--dw-text-muted);
}

.dangerous-pending__sample-scroll {
  max-height: 120px;
  overflow: auto;
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg-panel);
}

.dangerous-pending__sample-scroll table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--dw-text-xs);
}

.dangerous-pending__sample-scroll th,
.dangerous-pending__sample-scroll td {
  padding: 4px 8px;
  border-bottom: 1px solid var(--dw-border-light);
  text-align: left;
  white-space: nowrap;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dangerous-pending__sample-scroll th {
  position: sticky;
  top: 0;
  background: var(--dw-bg-muted);
  color: var(--dw-text-muted);
  font-weight: 600;
}

.dangerous-pending__suppress {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  margin-top: var(--dw-space-3);
  font-size: var(--dw-text-xs);
  color: var(--dw-text-secondary);
  cursor: pointer;
  user-select: none;
}

.dangerous-pending__review {
  margin: var(--dw-space-3) 0 0;
  padding-left: 18px;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.dangerous-pending__review-title {
  list-style: none;
  margin-left: -18px;
  font-weight: 600;
  color: var(--dw-text);
}

.dangerous-pending__review-blocked {
  color: var(--dw-danger);
}

.dangerous-pending__finding {
  margin-top: var(--dw-space-1);
}

.dangerous-pending__suggestion {
  display: block;
  opacity: 0.85;
}

.dangerous-pending__rewrite {
  margin-top: var(--dw-space-4);
  padding-top: var(--dw-space-4);
  border-top: 1px dashed color-mix(in srgb, var(--dw-border-light) 80%, transparent);
}

.dangerous-pending__rewrite-note {
  margin: 0 0 var(--dw-space-2);
  font-size: var(--dw-text-xs);
  color: var(--dw-text);
}

.dangerous-pending__rewrite-sql {
  margin: 0 0 var(--dw-space-3);
  padding: var(--dw-pad-tight);
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg-subtle);
  font-size: var(--dw-text-xs);
  white-space: pre-wrap;
  max-height: 120px;
  overflow: auto;
}
</style>
