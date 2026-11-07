<template>
  <!-- No-op host placeholder when Standard edition strips AI console layer -->
  <span class="ai-layer-empty" hidden aria-hidden="true"/>
</template>

<script setup lang="ts">
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
  openAiInput() {},
  toggleAiInput() {},
  requestAiSqlFix() {},
  onRequestAiSummary() {},
  closeAiSummary() {},
  onRequestAiExplain() {},
  closeAiExplain() {},
  requestAiIndexSuggest() {},
})
</script>
