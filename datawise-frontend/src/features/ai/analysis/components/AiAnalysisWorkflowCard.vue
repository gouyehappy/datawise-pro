<script setup lang="ts">
import AiAnalysisProgress from '@/features/ai/analysis/components/AiAnalysisProgress.vue'
import AiAnalysisSqlConfirm from '@/features/ai/analysis/components/AiAnalysisSqlConfirm.vue'
import type {AiAnalysisStepEvent} from '@/features/ai/types/analysis'
import type {AiSqlConfirmPending} from '@/features/ai/types/chat'

defineProps<{
  mode: 'streaming' | 'sql-confirm'
  analysisSteps?: AiAnalysisStepEvent[]
  analysisStreaming?: boolean
  sqlConfirmPending?: AiSqlConfirmPending | null
  resumingSql?: boolean
}>()

defineEmits<{
  confirmSql: []
  cancelSql: []
}>()
</script>

<template>
  <div
      v-if="mode === 'streaming'"
      class="ai-workflow-card ai-workflow-card--stacked ai-workflow-card--live"
  >
    <AiAnalysisProgress :steps="analysisSteps ?? []" live default-expanded/>
  </div>

  <div v-else class="ai-workflow-card ai-workflow-card--stacked">
    <!-- Progress lives on the analysis message turn — avoid a twin header here. -->
    <div class="ai-workflow-card__main">
      <AiAnalysisSqlConfirm
          v-if="sqlConfirmPending"
          :sql="sqlConfirmPending.sql"
          :busy="resumingSql"
          @confirm="$emit('confirmSql')"
          @cancel="$emit('cancelSql')"
      />
    </div>
  </div>
</template>
