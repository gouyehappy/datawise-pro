<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import type {AiAnalysisResult} from '@/features/ai/types/analysis'
import {
  exportAnalysisHtml,
  exportAnalysisMarkdown,
} from '@/features/ai/analysis/services/analysis-export.service'
import {
  isFederatedSourceColumn,
  shouldShowFederatedHint,
} from '@/features/ai/analysis/services/analysis-federated.service'
import {buildAiChartOption} from '@/features/ai/analysis/services/ai-chart.service'
import AiAnalysisChart from '@/features/ai/analysis/components/AiAnalysisChart.vue'
import AiAnalysisReportSection from '@/features/ai/analysis/components/AiAnalysisReportSection.vue'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {platformApi} from '@/api'
import {extractCanvasParameters} from '@/features/platform/services/analysis-canvas-parameters.service'
import {buildInsightActionFromAiMessage} from '@/features/ai/analysis/services/insight-action-export.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import type {AiDatabaseTarget} from '@/features/ai/shared/utils/database-targets'

const props = withDefaults(
    defineProps<{
      analysis: AiAnalysisResult
      federatedTargetCount?: number
      summaryText?: string
      targetsJson?: string
      sessionId?: string | null
      compact?: boolean
    }>(),
    {compact: false},
)

const emit = defineEmits<{
  openInConsole: [sql: string]
}>()

const {t} = useI18n()
const toast = useAppToast()
const layout = useLayoutStore()
const workspace = useWorkspaceStore()
const explorer = useExplorerStore()
const savingCanvas = ref(false)
const exportingTicket = ref(false)

function resolveCanvasOpenTarget(): {connectionId: string; database: string} | null {
  try {
    if (props.targetsJson) {
      const parsed = JSON.parse(props.targetsJson) as Array<Pick<AiDatabaseTarget, 'connectionId' | 'databaseId' | 'databaseLabel'>>
      const first = Array.isArray(parsed) ? parsed[0] : null
      if (first?.connectionId) {
        return {
          connectionId: first.connectionId,
          database: first.databaseLabel || first.databaseId || first.connectionId,
        }
      }
    }
  } catch {
    // Fall through to explorer default.
  }
  const connectionId = explorer.tree.find((node) => node.type === 'connection')?.id
  if (!connectionId) return null
  const database = explorer.findNode(connectionId)?.database || connectionId
  return {connectionId, database}
}

const PREVIEW_LIMIT = 8

const chartOption = computed(() => {
  if (!props.analysis.chart) return null
  // Card header already shows the chart title — avoid a second title inside ECharts.
  return buildAiChartOption(props.analysis.chart, props.analysis.columns, props.analysis.rows, {
    showTitle: false,
  })
})

const previewRows = computed(() => props.analysis.rows.slice(0, PREVIEW_LIMIT))

const columnKeys = computed(() =>
    props.analysis.columns.map((column) => column.key ?? column.name),
)

const showFederatedHint = computed(() =>
    shouldShowFederatedHint(props.federatedTargetCount ?? 0, props.analysis.columns),
)

function columnHeader(column: AiAnalysisResult['columns'][number]) {
  const key = column.key ?? column.name
  if (isFederatedSourceColumn(key)) return t('ai.analysis.federatedSourceColumn')
  return column.name
}

const chartTypeLabel = computed(() => {
  const type = props.analysis.chart?.type
  if (!type) return ''
  const key = `ai.analysis.chartTypes.${type}`
  const label = t(key)
  return label === key ? type : label
})

function exportMarkdown() {
  exportAnalysisMarkdown(props.analysis)
  toast.success(t('ai.analysis.exportMarkdownDone'))
}

function exportHtml() {
  exportAnalysisHtml(props.analysis)
  toast.success(t('ai.analysis.exportHtmlDone'))
}

async function createTicket() {
  if (exportingTicket.value) return
  exportingTicket.value = true
  try {
    const request = buildInsightActionFromAiMessage({
      reply: props.summaryText?.trim() || '',
      sql: props.analysis.sql,
      sessionId: props.sessionId,
      defaultTitle: t('ai.analysis.insightActionDefaultTitle'),
    })
    const result = await platformApi.createInsightAction(request)
    if (result.ticketUrl) {
      toast.success(
          t('ai.analysis.createTicketDoneWithUrl', {eventId: result.eventId, url: result.ticketUrl}),
      )
    } else {
      toast.success(t('ai.analysis.createTicketDone', {eventId: result.eventId}))
    }
  } catch (error) {
    toast.error(resolveCaughtApiErrorMessage(error, t, 'ai.generateFailedGeneric'))
  } finally {
    exportingTicket.value = false
  }
}

async function saveAsCanvas() {
  if (savingCanvas.value) return
  savingCanvas.value = true
  try {
    const title =
        props.analysis.chart?.title?.trim()
        || props.summaryText?.trim().slice(0, 80)
        || t('ai.analysis.saveAsCanvasDefaultTitle')
    const parameters = extractCanvasParameters(
        props.summaryText,
        props.analysis.sql,
    )
    await platformApi.saveAnalysisCanvas({
      title,
      description: props.summaryText?.trim().slice(0, 240) || undefined,
      promptTemplate: props.summaryText?.trim() || undefined,
      sql: props.analysis.sql,
      summary: props.summaryText?.trim() || undefined,
      chartSpecJson: props.analysis.chart ? JSON.stringify(props.analysis.chart) : undefined,
      reportMarkdown: props.analysis.report?.markdown || undefined,
      targetsJson: props.targetsJson,
      parameters,
    })
    const target = resolveCanvasOpenTarget()
    if (target) {
      layout.setModule('database')
      workspace.openPlatformCatalog({
        feature: 'analysis_canvas',
        connectionId: target.connectionId,
        database: target.database,
      })
      toast.success(t('ai.analysis.saveAsCanvasOpened'))
    } else {
      toast.success(t('ai.analysis.saveAsCanvasDone'))
    }
  } catch (error) {
    toast.error(resolveCaughtApiErrorMessage(error, t, 'ai.generateFailedGeneric'))
  } finally {
    savingCanvas.value = false
  }
}
</script>

<template>
  <div class="ai-analysis-panel" :class="{ 'ai-analysis-panel--compact': compact }">
    <header v-if="!compact" class="analysis-export-bar">
      <span class="analysis-export-bar__label">{{ t('ai.analysis.exportTitle') }}</span>
      <button class="ai-text-action" type="button" @click="exportMarkdown">
        {{ t('ai.analysis.exportMarkdown') }}
      </button>
      <button class="ai-text-action" type="button" @click="exportHtml">
        {{ t('ai.analysis.exportHtml') }}
      </button>
      <button
          class="ai-text-action"
          type="button"
          :disabled="savingCanvas"
          @click="saveAsCanvas"
      >
        {{ t('ai.analysis.saveAsCanvas') }}
      </button>
      <button
          class="ai-text-action"
          type="button"
          :disabled="exportingTicket"
          @click="createTicket"
      >
        {{ t('ai.analysis.createTicket') }}
      </button>
    </header>
    <section class="ai-section-card analysis-sql-card">
      <header class="ai-section-card__head">
        <h3 class="ai-section-card__title">
          <span class="ai-section-card__icon" aria-hidden="true">{{ t('ai.analysis.sectionIconSql') }}</span>
          {{ t('ai.analysis.sqlLabel') }}
        </h3>
        <button class="ai-text-action" type="button" @click="emit('openInConsole', analysis.sql)">
          {{ t('ai.openInConsole') }}
        </button>
      </header>
      <div class="analysis-sql-body ai-code-surface">
        <pre><code>{{ analysis.sql }}</code></pre>
      </div>
    </section>

    <section v-if="chartOption && analysis.chart" class="ai-section-card">
      <header class="ai-section-card__head">
        <h3 class="ai-section-card__title">
          <span class="ai-section-card__icon" aria-hidden="true">{{ t('ai.analysis.sectionIconChart') }}</span>
          {{ analysis.chart.title || t('ai.analysis.chartSection') }}
        </h3>
        <span v-if="chartTypeLabel" class="analysis-chip">{{ chartTypeLabel }}</span>
      </header>
      <AiAnalysisChart :option="chartOption" :compact="compact"/>
    </section>

    <section v-if="analysis.pythonInsight" class="ai-section-card">
      <header class="ai-section-card__head">
        <h3 class="ai-section-card__title">
          <span class="ai-section-card__icon" aria-hidden="true">{{ t('ai.analysis.sectionIconPython') }}</span>
          {{ t('ai.analysis.pythonInsightLabel') }}
        </h3>
      </header>
      <div class="analysis-python-body">
        <p class="analysis-python-text">{{ analysis.pythonInsight }}</p>
      </div>
    </section>

    <AiAnalysisReportSection
        v-if="analysis.report?.markdown"
        :report="analysis.report"
    />

    <section v-if="analysis.rows.length" class="ai-section-card">
      <header class="ai-section-card__head">
        <h3 class="ai-section-card__title">
          <span class="ai-section-card__icon" aria-hidden="true">{{ t('ai.analysis.sectionIconData') }}</span>
          {{ t('ai.analysis.dataPreview', {count: analysis.rows.length}) }}
        </h3>
        <span v-if="analysis.rows.length > PREVIEW_LIMIT" class="analysis-chip analysis-chip--muted">
          {{ t('ai.analysis.previewShown', {shown: PREVIEW_LIMIT, total: analysis.rows.length}) }}
        </span>
      </header>
      <p v-if="showFederatedHint" class="analysis-federated-hint">
        {{ t('ai.analysis.federatedSourceHint') }}
      </p>
      <div class="analysis-table-scroll">
        <table class="analysis-table">
          <thead>
          <tr>
            <th v-for="column in analysis.columns" :key="column.key ?? column.name">
              {{ columnHeader(column) }}
            </th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="(row, rowIndex) in previewRows" :key="rowIndex">
            <td v-for="key in columnKeys" :key="key">
              {{ row[key] ?? '' }}
            </td>
          </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.ai-analysis-panel {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-6);
}

.ai-analysis-panel--compact {
  gap: var(--dw-space-3);
}

.ai-analysis-panel--compact .analysis-sql-body pre {
  padding: var(--dw-space-3);
  max-height: 160px;
  overflow: auto;
  font-size: var(--dw-text-xs);
}

.ai-analysis-panel--compact .analysis-table-scroll {
  max-height: 180px;
  overflow: auto;
}

.analysis-export-bar {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-md);
  flex-wrap: wrap;
  padding: 0 var(--dw-space-1);
}

.analysis-export-bar__label {
  font-size: var(--dw-text-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--dw-text-muted);
}

.analysis-sql-card .analysis-sql-body {
  border: none;
  border-radius: 0;
}

.analysis-sql-body pre {
  margin: 0;
  padding: var(--dw-space-6) var(--dw-space-7);
  overflow-x: auto;
}

.analysis-sql-body code {
  font-family: var(--dw-mono);
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading-loose);
  white-space: pre-wrap;
}

.analysis-chip {
  padding: var(--dw-space-2) var(--dw-space-5);
  border-radius: var(--dw-radius-pill);
  border: 1px solid color-mix(in srgb, var(--dw-primary) 28%, var(--dw-border));
  background: var(--dw-primary-soft);
  color: var(--dw-primary);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  white-space: nowrap;
  box-shadow: none;
}

.analysis-table-scroll {
  overflow-x: auto;
  border-radius: 0 0 var(--dw-panel-radius) var(--dw-panel-radius);
}

.analysis-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--dw-text-sm);
}

.analysis-table th,
.analysis-table td {
  padding: var(--dw-space-5) var(--dw-space-7);
  border-bottom: 1px solid var(--dw-border-light);
  text-align: left;
  white-space: nowrap;
}

.analysis-table th {
  background: var(--dw-bg-muted);
  color: var(--dw-text-secondary);
  font-weight: 600;
  font-size: var(--dw-text-xs);
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.analysis-table tbody tr {
  transition: background var(--dw-duration-fast) var(--dw-ease);
}

.analysis-table tbody tr:nth-child(even) td {
  background: color-mix(in srgb, var(--dw-bg-panel) 40%, transparent);
}

.analysis-table tbody tr:hover td {
  background: color-mix(in srgb, var(--dw-primary) 8%, var(--dw-bg));
}

.analysis-chip--muted {
  border-color: var(--dw-border-light);
  background: var(--dw-bg);
  color: var(--dw-text-muted);
  box-shadow: none;
}

.analysis-federated-hint {
  margin: 0;
  padding: 0 var(--dw-space-7) var(--dw-space-5);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
  color: var(--dw-text-muted);
}

.analysis-python-body {
  padding: var(--dw-space-6) var(--dw-space-7);
}

.analysis-python-text {
  margin: 0;
  font-size: var(--dw-text-md);
  line-height: var(--dw-leading-loose);
  white-space: pre-wrap;
  color: var(--dw-text);
}

.analysis-table tr:last-child td {
  border-bottom: none;
}
</style>
