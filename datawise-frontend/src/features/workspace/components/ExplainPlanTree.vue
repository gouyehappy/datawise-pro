<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'
import ExplainPlanNode from '@/features/workspace/components/ExplainPlanNode.vue'
import ExplainPlanTable from '@/features/workspace/components/ExplainPlanTable.vue'
import ExplainPlanGraph from '@/features/workspace/components/ExplainPlanGraph.vue'
import type {DbType} from '@/core/types'
import type {ExplainPlanMode, ExplainPlanNode as ExplainPlanNodeType} from '@/features/workspace/types/explain-plan'
import {buildExplainIndexHints} from '@/features/workspace/services/explain-index-hints.service'
import {collectExplainPlanRisks} from '@/features/workspace/services/explain-plan-risk.service'
import {
  buildTabularExplainPlan,
  isTabularExplainPlan,
  stripExplainPrefix,
} from '@/features/workspace/services/explain-plan-tabular.service'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {hasExplainProAccess} from '@/features/pack/services/explain-pro-entitlement'

const emit = defineEmits<{
  'open-index-draft': [payload?: {table?: string}]
  'request-ai-explain': []
  'request-ai-index-suggest': []
}>()

const props = withDefaults(defineProps<{
  nodes: ExplainPlanNodeType[]
  sql?: string
  dbType?: DbType
  explainMode?: ExplainPlanMode
  aiExplainLoading?: boolean
  enableAiExplain?: boolean
  /** 始终允许启发式「打开索引草稿」（不依赖 AI 插件） */
  enableIndexDraft?: boolean
  /** AI 增强索引建议（插件 p-ai-index-suggest） */
  enableAiIndexSuggest?: boolean
  aiIndexSuggestLoading?: boolean
}>(), {
  aiExplainLoading: false,
  enableAiExplain: false,
  enableIndexDraft: true,
  enableAiIndexSuggest: false,
  aiIndexSuggestLoading: false,
})

const {t} = useI18n()
const entitlement = useEntitlementStore()
const collapsed = ref<Record<string, boolean>>({})
const viewMode = ref<'steps' | 'graph'>('steps')

const explainPro = computed(() =>
    hasExplainProAccess({
      mode: entitlement.mode,
      dataopsUsable: entitlement.isPackUsable('pack.dataops'),
    }),
)

const indexHints = computed(() =>
    explainPro.value ? buildExplainIndexHints(props.nodes, props.dbType) : [],
)
const lockedHintCount = computed(() =>
    explainPro.value ? 0 : buildExplainIndexHints(props.nodes, props.dbType).length,
)
const nodeRisks = computed(() => collectExplainPlanRisks(props.nodes))
const displaySql = computed(() => stripExplainPrefix(props.sql))
const showTabularPlan = computed(() => isTabularExplainPlan(props.nodes, props.dbType))
const tabularPlan = computed(() => buildTabularExplainPlan(props.nodes))
const canShowGraph = computed(() => props.nodes.length > 0 && !showTabularPlan.value)

const canOpenIndexDraft = computed(() =>
    props.enableIndexDraft && Boolean(props.sql?.trim()),
)

function toggleNode(id: string) {
  collapsed.value[id] = !collapsed.value[id]
}

function openDraftForHint(table?: string) {
  emit('open-index-draft', table ? {table} : undefined)
}

function selectGraphView() {
  if (!explainPro.value) {
    entitlement.guardPack('pack.dataops', 'ops.explain.pro')
    return
  }
  viewMode.value = 'graph'
}

function unlockExplainPro() {
  entitlement.guardPack('pack.dataops', 'ops.explain.pro')
}
</script>

<template>
  <div class="explain-plan">
    <header class="explain-plan__head">
      <div class="explain-plan__title-row">
        <div class="explain-plan__title-group">
          <span class="explain-plan__title">{{ t('queryResult.explainPlanTitle') }}</span>
          <span v-if="explainMode" class="explain-plan__mode">
            {{ explainMode === 'analyze'
                ? t('queryResult.explainPlanModeAnalyze')
                : t('queryResult.explainPlanModeEstimate') }}
          </span>
        </div>
        <div class="explain-plan__actions">
          <div
              v-if="canShowGraph"
              class="dw-segment dw-segment--sm"
              role="tablist"
              :aria-label="t('queryResult.explainPlanView')"
          >
            <button
                type="button"
                class="dw-segment__btn"
                :class="{ 'is-active': viewMode === 'steps' }"
                role="tab"
                :aria-selected="viewMode === 'steps'"
                @click="viewMode = 'steps'"
            >
              {{ t('queryResult.explainPlanViewSteps') }}
            </button>
            <button
                type="button"
                class="dw-segment__btn"
                :class="{ 'is-active': viewMode === 'graph' && explainPro }"
                role="tab"
                :aria-selected="viewMode === 'graph' && explainPro"
                @click="selectGraphView"
            >
              {{ t('queryResult.explainPlanViewGraph') }}
            </button>
          </div>
          <button
              v-if="!explainPro && (canShowGraph || lockedHintCount > 0)"
              type="button"
              class="grid-label-btn"
              @click="unlockExplainPro"
          >
            {{ t('queryResult.explainProUnlock') }}
          </button>
          <button
              v-if="enableAiExplain"
              type="button"
              class="grid-label-btn"
              :disabled="aiExplainLoading"
              @click="emit('request-ai-explain')"
          >
            <DwIcon class="grid-glyph" name="ai" size="sm" :stroke-width="1.5"/>
            <span>{{ aiExplainLoading ? t('queryResult.aiExplainLoading') : t('queryResult.aiExplain') }}</span>
          </button>
          <button
              v-if="canOpenIndexDraft"
              type="button"
              class="grid-label-btn"
              @click="emit('open-index-draft')"
          >
            <DwIcon class="grid-glyph" name="list-ordered" size="sm" :stroke-width="1.5"/>
            <span>{{ t('queryResult.indexDraftAction') }}</span>
          </button>
          <button
              v-if="enableAiIndexSuggest && canOpenIndexDraft"
              type="button"
              class="grid-label-btn"
              :disabled="aiIndexSuggestLoading"
              @click="emit('request-ai-index-suggest')"
          >
            <DwIcon class="grid-glyph" name="ai" size="sm" :stroke-width="1.5"/>
            <span>{{ aiIndexSuggestLoading ? t('queryResult.indexSuggestLoading') : t('queryResult.indexSuggestAction') }}</span>
          </button>
        </div>
      </div>
    </header>

    <div class="explain-plan__body">
    <details v-if="displaySql" class="explain-plan__sql-panel">
      <summary class="explain-plan__sql-summary">
        <DwIcon class="explain-plan__sql-chevron" name="chevron-down" size="xs" :stroke-width="1.5"/>
        <span>{{ t('queryResult.failedSql') }}</span>
      </summary>
      <pre class="explain-plan__sql">{{ displaySql }}</pre>
    </details>

    <details v-if="lockedHintCount > 0" class="explain-plan__hints-panel">
      <summary class="explain-plan__hints-summary">
        <DwIcon class="explain-plan__hints-chevron" name="chevron-down" size="xs" :stroke-width="1.5"/>
        <span>{{ t('queryResult.explainProHintsLocked', {count: lockedHintCount}) }}</span>
      </summary>
      <div class="explain-plan__pro-lock">
        <p>{{ t('queryResult.explainProHintsLockedBody') }}</p>
        <button type="button" class="grid-label-btn" @click="unlockExplainPro">
          {{ t('queryResult.explainProUnlock') }}
        </button>
      </div>
    </details>

    <details v-if="indexHints.length" class="explain-plan__hints-panel" open>
      <summary class="explain-plan__hints-summary">
        <DwIcon class="explain-plan__hints-chevron" name="chevron-down" size="xs" :stroke-width="1.5"/>
        <span>{{ t('queryResult.explainPlanHints', {count: indexHints.length}) }}</span>
      </summary>
      <ul class="explain-plan__hints">
        <li
            v-for="hint in indexHints"
            :key="hint.id"
            :class="`explain-plan__hint explain-plan__hint--${hint.severity}`"
        >
          <div class="explain-plan__hint-body">
            <strong>{{ hint.message }}</strong>
            <span v-if="hint.suggestion">{{ hint.suggestion }}</span>
          </div>
          <button
              v-if="canOpenIndexDraft"
              type="button"
              class="explain-plan__hint-action"
              @click="openDraftForHint(hint.table)"
          >
            {{ t('queryResult.indexDraftHintAction') }}
          </button>
        </li>
      </ul>
    </details>

    <details v-if="nodes.length" class="explain-plan__steps-panel" open>
      <summary class="explain-plan__steps-summary">
        <DwIcon class="explain-plan__steps-chevron" name="chevron-down" size="xs" :stroke-width="1.5"/>
        <span>{{ t('queryResult.explainPlanStepsPanel', {count: nodes.length}) }}</span>
      </summary>
      <div class="explain-plan__steps-content">
        <ExplainPlanTable
            v-if="showTabularPlan"
            :columns="tabularPlan.columns"
            :rows="tabularPlan.rows"
        />

        <ExplainPlanGraph
            v-else-if="viewMode === 'graph' && explainPro"
            :nodes="nodes"
        />

        <ul v-else class="explain-plan__tree">
          <ExplainPlanNode
              v-for="node in nodes"
              :key="node.id"
              :node="node"
              :depth="0"
              :collapsed="collapsed"
              :risks="nodeRisks"
              @toggle="toggleNode"
          />
        </ul>
      </div>
    </details>
    </div>
  </div>
</template>

<style scoped>
.explain-plan {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  padding: var(--dw-space-7) var(--dw-space-8) var(--dw-space-8);
  display: flex;
  flex-direction: column;
}

.explain-plan__head {
  flex: 0 0 auto;
  margin-bottom: var(--dw-space-5);
  /* Keep toolbar within the pane width; wide tables scroll in the body only. */
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.explain-plan__body {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: auto;
}

.explain-plan__title-row {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--dw-space-4);
}

.explain-plan__title-group {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-gap);
  min-width: 0;
}

.explain-plan__title {
  font-size: var(--dw-text-md);
  font-weight: 700;
  color: var(--dw-text);
}

.explain-plan__mode {
  padding: var(--dw-space-1) var(--dw-space-3);
  border-radius: var(--dw-radius-pill);
  background: color-mix(in srgb, var(--dw-text) 6%, transparent);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  letter-spacing: 0.02em;
}

.explain-plan__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: var(--dw-gap-xs);
  width: 100%;
  min-width: 0;
}

.explain-plan__actions :deep(.grid-label-btn) {
  flex: 0 0 auto;
  width: max-content;
  max-width: 100%;
}

.explain-plan__actions :deep(.grid-label-btn .grid-glyph),
.explain-plan__actions :deep(.grid-label-btn .dw-icon-root) {
  width: var(--dw-icon-size-sm);
  height: var(--dw-icon-size-sm);
  flex-shrink: 0;
}

.explain-plan__actions :deep(.grid-label-btn .grid-glyph) {
  color: var(--dw-text-muted);
}

.explain-plan__actions :deep(.grid-label-btn:hover:not(:disabled) .grid-glyph) {
  color: var(--dw-primary);
}
.explain-plan__sql-panel,
.explain-plan__hints-panel,
.explain-plan__steps-panel {
  margin-bottom: var(--dw-space-5);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background: color-mix(in srgb, var(--dw-bg-panel) 90%, var(--dw-bg));
}

.explain-plan__sql-summary,
.explain-plan__hints-summary,
.explain-plan__steps-summary {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  padding: var(--dw-space-4) var(--dw-space-6);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  cursor: pointer;
  list-style: none;
  user-select: none;
}

.explain-plan__sql-summary::-webkit-details-marker,
.explain-plan__hints-summary::-webkit-details-marker,
.explain-plan__steps-summary::-webkit-details-marker {
  display: none;
}

.explain-plan__sql-chevron,
.explain-plan__hints-chevron,
.explain-plan__steps-chevron {
  color: var(--dw-text-muted);
  transition: transform var(--dw-duration) var(--dw-ease);
}

.explain-plan__sql-panel[open] .explain-plan__sql-chevron,
.explain-plan__hints-panel[open] .explain-plan__hints-chevron,
.explain-plan__steps-panel[open] .explain-plan__steps-chevron {
  transform: rotate(180deg);
}

.explain-plan__sql {
  margin: 0;
  padding: var(--dw-space-5) var(--dw-space-6) var(--dw-space-6);
  border-top: 1px solid var(--dw-border-light);
  font-family: var(--dw-font-mono);
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading-loose);
  white-space: pre-wrap;
  color: var(--dw-text-secondary);
}

.explain-plan__hints {
  list-style: none;
  margin: 0;
  padding: 0 var(--dw-space-6) var(--dw-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap);
}

.explain-plan__hint {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--dw-gap);
  padding: var(--dw-pad-control);
  border-radius: var(--dw-control-radius);
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading);
  border: 1px solid var(--dw-border-light);
}

.explain-plan__hint-body {
  min-width: 0;
  flex: 1;
}

.explain-plan__hint-body strong {
  display: block;
  margin-bottom: var(--dw-space-1);
}

.explain-plan__hint-action {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  height: var(--dw-btn-height-sm);
  padding: 0 var(--dw-space-4);
  border: 1px solid color-mix(in srgb, var(--dw-border-light) 85%, transparent);
  border-radius: var(--dw-btn-radius);
  background: color-mix(in srgb, var(--dw-bg) 88%, var(--dw-bg-muted));
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: var(--dw-transition-colors);
}

.explain-plan__hint-action:hover {
  background: var(--dw-primary-softer);
  border-color: color-mix(in srgb, var(--dw-primary) 22%, var(--dw-border-light));
  color: var(--dw-primary);
}

.explain-plan__hint--warning {
  background: color-mix(in srgb, var(--dw-warning) 12%, var(--dw-bg-panel));
}

.explain-plan__hint--info {
  background: color-mix(in srgb, var(--dw-bg-panel) 90%, var(--dw-bg));
}

.explain-plan__pro-lock {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-gap);
  padding: 0 var(--dw-space-6) var(--dw-space-5);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-sm);
}

.explain-plan__pro-lock p {
  margin: 0;
  flex: 1;
  min-width: 12rem;
}

.explain-plan__steps-content {
  padding: 0 var(--dw-space-6) var(--dw-space-6);
}

.explain-plan__tree {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg-panel);
}
</style>
