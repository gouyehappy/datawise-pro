<template>
  <!-- Standard edition: reachable host so toolbar / Alt+/ / query-mode rail can upsell -->
  <span class="ai-layer-empty" hidden aria-hidden="true"/>
</template>

<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {
  buildDegradedSqlErrorHint,
} from '@/features/workspace/services/console-ai-degraded.service'

const {t} = useI18n()
const entitlement = useEntitlementStore()
const workspace = useWorkspaceStore()
const toast = useAppToast()

/** Full generate / Agent entry → Insight paywall */
function openAiUpsell(context = 'console.ai') {
  entitlement.openPaywall('pack.ai', context)
}

/**
 * B2-2 lite path: give a one-line local hint for common SQL errors,
 * then open Insight paywall (no free model call in standard stub).
 */
function openLiteUpsell(
    context: 'console.ai.fix' | 'console.ai.explain' | 'console.ai.lite',
    errorMessage?: string | null,
) {
  const hintId = buildDegradedSqlErrorHint(errorMessage)
  if (hintId) {
    const tip = t(`console.aiDegraded.${hintId}`)
    workspace.setStatus(tip)
    toast.show(tip, {variant: 'info'})
  } else {
    const tip = t('console.aiDegraded.generic')
    workspace.setStatus(tip)
  }
  entitlement.openPaywall('pack.ai', context)
}

defineExpose({
  showAiInput: false,
  aiFixLoading: false,
  aiSummaryLoading: false,
  aiSummaryOpen: false,
  aiSummaryText: '',
  aiIndexSuggestLoading: false,
  aiExplainLoading: false,
  aiExplainOpen: false,
  aiExplainText: '',
  openAiInput() {
    openAiUpsell('console.ai')
  },
  toggleAiInput() {
    openAiUpsell('console.ai')
  },
  requestAiSqlFix(payload?: {errorMessage?: string; message?: string} | string) {
    const message = typeof payload === 'string'
      ? payload
      : (payload?.errorMessage ?? payload?.message ?? null)
    openLiteUpsell('console.ai.fix', message)
  },
  onRequestAiSummary() {
    openAiUpsell('console.ai')
  },
  closeAiSummary() {},
  onRequestAiExplain() {
    const tip = t('console.aiDegraded.explainPlan')
    workspace.setStatus(tip)
    toast.show(tip, {variant: 'info'})
    entitlement.openPaywall('pack.ai', 'console.ai.explain')
  },
  closeAiExplain() {},
  requestAiIndexSuggest() {
    openAiUpsell('console.ai')
  },
})
</script>
