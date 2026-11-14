<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwCodeViewer} from '@/core/components'
import type {AiAnalysisReport} from '@/features/ai/types/analysis'
import {
    parseAnalysisReport,
    parseAnalysisReportMeta,
    type ParsedAnalysisReport,
} from '@/features/ai/analysis/services/analysis-report-markdown.service'
import {useAppToast} from '@/features/layout/composables/useAppToast'

const props = defineProps<{
  report: AiAnalysisReport
  defaultExpanded?: boolean
}>()

const {t} = useI18n()
const toast = useAppToast()

const expanded = ref(props.defaultExpanded ?? false)

/** Cheap: title / excerpt / count — runs while collapsed so Agent open stays light. */
const meta = computed(() => parseAnalysisReportMeta(props.report.markdown))

/** Full HTML/code parse only after expand (or when already expanded on mount). */
const fullParsed = ref<ParsedAnalysisReport | null>(null)

watch(
    [expanded, () => props.report.markdown],
    ([isExpanded]) => {
      if (!isExpanded) return
      fullParsed.value = parseAnalysisReport(props.report.markdown ?? '')
    },
    {immediate: true},
)

const title = computed(() => fullParsed.value?.title || meta.value.title || t('ai.analysis.reportSection'))
const excerpt = computed(() => fullParsed.value?.excerpt || meta.value.excerpt)
const sectionCount = computed(() => fullParsed.value?.sections.length || meta.value.sectionCount)
const truncated = computed(() => fullParsed.value?.truncated || meta.value.truncated)
const sections = computed(() => fullParsed.value?.sections ?? [])

function resolveCodeLanguage(lang: string): string {
  const normalized = lang.trim().toLowerCase()
  if (!normalized || normalized === 'sql') return 'sql'
  return normalized
}

function codeViewerTitle(lang: string): string {
  const normalized = lang.trim().toLowerCase()
  if (!normalized || normalized === 'sql') return t('ai.analysis.sqlLabel')
  return lang.toUpperCase()
}

async function copyMarkdown(event: MouseEvent) {
  event.stopPropagation()
  try {
    await navigator.clipboard.writeText(props.report.markdown)
  } catch {
    toast.error(t('ai.analysis.reportCopyFailed'))
  }
}

function toggleExpanded() {
  expanded.value = !expanded.value
}
</script>

<template>
  <section
      class="analysis-report-panel"
      :class="{ 'is-expanded': expanded }"
  >
    <button
        class="analysis-report-panel__header"
        type="button"
        :aria-expanded="expanded"
        @click="toggleExpanded"
    >
      <div class="analysis-report-panel__summary">
        <span class="analysis-report-panel__icon" aria-hidden="true">R</span>
        <div class="analysis-report-panel__titles">
          <span class="analysis-report-panel__eyebrow">{{ t('ai.analysis.reportSection') }}</span>
          <span class="analysis-report-panel__title">{{ title }}</span>
          <span
              v-if="!expanded && excerpt"
              class="analysis-report-panel__excerpt"
          >
            {{ excerpt }}
          </span>
          <span
              v-if="truncated"
              class="analysis-report-panel__truncated"
          >
            {{ t('ai.analysis.reportTruncated') }}
          </span>
        </div>
      </div>

      <div class="analysis-report-panel__meta">
        <span v-if="sectionCount" class="analysis-report-panel__count">
          {{ t('ai.analysis.reportSectionCount', {count: sectionCount}) }}
        </span>
        <button
            class="analysis-report-panel__copy ai-text-action"
            type="button"
            :title="t('ai.analysis.reportCopy')"
            @click="copyMarkdown"
        >
          {{ t('ai.analysis.reportCopy') }}
        </button>
        <span class="analysis-report-panel__chevron" aria-hidden="true"/>
      </div>
    </button>

    <div v-show="expanded" class="analysis-report-panel__body">
      <article
          v-for="(section, index) in sections"
          :key="`${section.title}-${index}`"
          class="analysis-report-panel__section"
      >
        <h4 class="analysis-report-panel__section-title">{{ section.title }}</h4>
        <div class="analysis-report-panel__section-content">
          <template v-for="(block, blockIndex) in section.blocks" :key="blockIndex">
            <div
                v-if="block.type === 'html'"
                class="analysis-report-panel__html"
                v-html="block.html"
            />
            <DwCodeViewer
                v-else
                class="analysis-report-panel__code"
                :content="block.code"
                :language="resolveCodeLanguage(block.lang)"
                :title="codeViewerTitle(block.lang)"
                dark
                readonly
            />
          </template>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.analysis-report-panel {
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg);
  overflow: hidden;
  box-shadow: 0 1px 0 color-mix(in srgb, var(--dw-text) 3%, transparent);
  transition: border-color var(--dw-duration-slow) var(--dw-ease), box-shadow var(--dw-duration-slow) var(--dw-ease);
}

.analysis-report-panel:hover {
  border-color: color-mix(in srgb, var(--dw-primary) 16%, var(--dw-border-light));
}

.analysis-report-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--dw-space-6);
  width: 100%;
  padding: var(--dw-space-6) 15px;
  border: none;
  background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--dw-bg-panel) 80%, var(--dw-bg)),
      color-mix(in srgb, var(--dw-bg-panel) 40%, var(--dw-bg))
  );
  text-align: left;
  cursor: pointer;
}

.analysis-report-panel__summary {
  display: flex;
  align-items: flex-start;
  gap: var(--dw-gap-md);
  min-width: 0;
}

.analysis-report-panel__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: var(--dw-btn-height);
  border-radius: var(--dw-control-radius);
  flex-shrink: 0;
  background: linear-gradient(
      145deg,
      color-mix(in srgb, var(--dw-primary) 18%, var(--dw-primary-soft)),
      var(--dw-primary-soft)
  );
  color: var(--dw-primary);
  font-size: var(--dw-text-xs);
  font-weight: 700;
}

.analysis-report-panel__titles {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-1);
  min-width: 0;
}

.analysis-report-panel__eyebrow {
  font-size: var(--dw-text-xs);
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--dw-text-muted);
}

.analysis-report-panel__title {
  font-size: var(--dw-text-md);
  font-weight: 600;
  line-height: var(--dw-leading-snug);
  color: var(--dw-text);
}

.analysis-report-panel__excerpt {
  margin-top: var(--dw-space-1);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
  color: var(--dw-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.analysis-report-panel__truncated {
  margin-top: var(--dw-space-1);
  font-size: var(--dw-text-xs);
  color: var(--dw-warning, #d97706);
}

.analysis-report-panel__meta {
  display: flex;
  align-items: center;
  gap: var(--dw-gap);
  flex-shrink: 0;
}

.analysis-report-panel__count {
  padding: var(--dw-space-2) var(--dw-space-5);
  border-radius: var(--dw-radius-pill);
  border: 1px solid color-mix(in srgb, var(--dw-primary) 20%, var(--dw-border-light));
  background: color-mix(in srgb, var(--dw-bg) 85%, var(--dw-primary-soft));
  color: var(--dw-primary);
  font-size: var(--dw-text-xs);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.analysis-report-panel__copy {
  font-size: var(--dw-text-xs);
  padding: var(--dw-space-2) var(--dw-space-4);
}

.analysis-report-panel__chevron {
  width: 8px;
  height: 8px;
  border-right: 2px solid var(--dw-text-muted);
  border-bottom: 2px solid var(--dw-text-muted);
  transform: rotate(45deg);
  transition: transform var(--dw-duration-slow) var(--dw-ease);
}

.analysis-report-panel.is-expanded .analysis-report-panel__chevron {
  transform: rotate(-135deg);
  margin-top: var(--dw-space-2);
}

.analysis-report-panel__body {
  padding: var(--dw-space-2) var(--dw-space-8) var(--dw-space-8);
  border-top: 1px solid var(--dw-border-light);
  background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--dw-bg-panel) 25%, var(--dw-bg)),
      var(--dw-bg)
  );
}

.analysis-report-panel__section + .analysis-report-panel__section {
  margin-top: var(--dw-space-7);
  padding-top: var(--dw-space-7);
  border-top: 1px dashed var(--dw-border-light);
}

.analysis-report-panel__section-title {
  margin: 0 0 var(--dw-space-4);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--dw-text-muted);
}

.analysis-report-panel__section-content {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-5);
}

.analysis-report-panel__code {
  height: 260px;
  min-height: 220px;
  max-height: min(48vh, 360px);
  border-radius: var(--dw-panel-radius);
  overflow: hidden;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--dw-text) 24%, transparent);
}

.analysis-report-panel__code :deep(.dw-code-viewer__body),
.analysis-report-panel__code :deep(.monaco-host) {
  min-height: 0;
  height: 100%;
}

.analysis-report-panel__html :deep(.report-paragraph) {
  margin: 0 0 var(--dw-space-4);
  font-size: var(--dw-text-md);
  line-height: var(--dw-leading-loose);
  color: var(--dw-text);
}

.analysis-report-panel__html :deep(.report-paragraph:last-child) {
  margin-bottom: 0;
}

.analysis-report-panel__html :deep(.report-list) {
  margin: 0;
  padding-left: 18px;
  font-size: var(--dw-text-md);
  line-height: var(--dw-leading-loose);
  color: var(--dw-text);
}

.analysis-report-panel__html :deep(.report-table-wrap) {
  overflow-x: auto;
  border-radius: var(--dw-panel-radius);
  border: 1px solid var(--dw-border-light);
}

.analysis-report-panel__html :deep(.report-table) {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--dw-text-sm);
}

.analysis-report-panel__html :deep(.report-table th),
.analysis-report-panel__html :deep(.report-table td) {
  padding: var(--dw-space-4) var(--dw-space-6);
  border-bottom: 1px solid var(--dw-border-light);
  text-align: left;
  white-space: nowrap;
}

.analysis-report-panel__html :deep(.report-table th) {
  background: color-mix(in srgb, var(--dw-bg-panel) 70%, var(--dw-bg));
  color: var(--dw-text-secondary);
  font-weight: 600;
  font-size: var(--dw-text-xs);
}

.analysis-report-panel__html :deep(.report-table tr:last-child td) {
  border-bottom: none;
}
</style>
