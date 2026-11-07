<script setup lang="ts">
import type {AiAnalysisStepId} from '@/features/ai/types/analysis'

defineProps<{
  step: AiAnalysisStepId | string
  size?: number
}>()
</script>

<template>
  <!-- Per-step glyphs for the analysis pipeline (inline SVG, no external deps) -->
  <svg
      class="ai-step-icon"
      :width="size ?? 14"
      :height="size ?? 14"
      viewBox="0 0 16 16"
      aria-hidden="true"
  >
    <!-- intent: data source -->
    <g v-if="step === 'intent'">
      <ellipse cx="8" cy="4.5" rx="5" ry="2" fill="none" stroke="currentColor" stroke-width="1.3"/>
      <path
          d="M3 4.5v4c0 1.1 2.24 2 5 2s5-.9 5-2v-4"
          fill="none"
          stroke="currentColor"
          stroke-width="1.3"
          stroke-linejoin="round"
      />
      <path d="M3 6.5c0 1.1 2.24 2 5 2s5-.9 5-2" fill="none" stroke="currentColor" stroke-width="1.3" opacity="0.55"/>
    </g>

    <!-- step_route: LLM pipeline routing -->
    <g v-else-if="step === 'step_route'">
      <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.3"/>
      <path d="M5.5 8h5M8 5.5v5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      <circle cx="11.5" cy="5" r="1" fill="currentColor"/>
      <circle cx="5" cy="11" r="1" fill="currentColor"/>
    </g>

    <!-- evidence: knowledge recall -->
    <g v-else-if="step === 'evidence'">
      <path
          d="M3.5 2.5h5.8a1 1 0 0 1 .7.3l2.5 2.5v8.2a.5.5 0 0 1-.5.5H3.5a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5z"
          fill="none"
          stroke="currentColor"
          stroke-width="1.3"
          stroke-linejoin="round"
      />
      <path d="M9 2.8V5.5H11.7" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      <path d="M5 8h6M5 10.5h4.2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"
            opacity="0.7"/>
    </g>

    <!-- schema: table structure -->
    <g v-else-if="step === 'schema'">
      <rect x="2.5" y="3" width="11" height="10" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3"/>
      <path d="M2.5 6.2h11M6.2 6.2v6.8M10 6.2v6.8" fill="none" stroke="currentColor" stroke-width="1.3"/>
    </g>

    <!-- sql_generate: code -->
    <g v-else-if="step === 'sql_generate'">
      <path
          d="M5.2 4.2 2.8 8l2.4 3.8M10.8 4.2l2.4 3.8-2.4 3.8"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
          stroke-linejoin="round"
      />
    </g>

    <!-- sql_validate: shield check -->
    <g v-else-if="step === 'sql_validate'">
      <path
          d="M8 1.8 3.2 3.6v4.1c0 2.8 2.1 4.8 4.8 6.5 2.7-1.7 4.8-3.7 4.8-6.5V3.6L8 1.8z"
          fill="none"
          stroke="currentColor"
          stroke-width="1.3"
          stroke-linejoin="round"
      />
      <path
          d="M6 8.1 7.2 9.4 10.2 6.4"
          fill="none"
          stroke="currentColor"
          stroke-width="1.3"
          stroke-linecap="round"
          stroke-linejoin="round"
      />
    </g>

    <!-- sql_execute: play / run -->
    <g v-else-if="step === 'sql_execute'">
      <circle cx="8" cy="8" r="5.8" fill="none" stroke="currentColor" stroke-width="1.3"/>
      <path d="M6.8 5.6v4.8l4.2-2.4-4.2-2.4z" fill="currentColor"/>
    </g>

    <!-- planner: route map -->
    <g v-else-if="step === 'planner'">
      <circle cx="4" cy="8" r="1.6" fill="currentColor"/>
      <circle cx="8" cy="4.5" r="1.6" fill="currentColor"/>
      <circle cx="12" cy="8" r="1.6" fill="currentColor"/>
      <path d="M5.2 7.4 7 5.2M9 5.2l1.8 2.2" fill="none" stroke="currentColor" stroke-width="1.2"
            stroke-linecap="round"/>
    </g>

    <!-- python_*: snake glyph -->
    <g v-else-if="step === 'python_generate' || step === 'python_execute' || step === 'python_analyze'">
      <path
          d="M3.5 5.5c0-1.2 1.2-2.2 2.8-2.2h4.2c1.4 0 2.5 1 2.5 2.2s-1.1 2.2-2.5 2.2H6.3c-1.4 0-2.5 1-2.5 2.2s1.1 2.2 2.5 2.2h4.2"
          fill="none"
          stroke="currentColor"
          stroke-width="1.3"
          stroke-linecap="round"
      />
      <circle cx="11.8" cy="4.2" r="0.9" fill="currentColor"/>
    </g>

    <!-- report: export -->
    <g v-else-if="step === 'report'">
      <path
          d="M4.5 2.2h4.6l3.7 3.7v7.4a.5.5 0 0 1-.5.5H4.5a.5.5 0 0 1-.5-.5V2.7a.5.5 0 0 1 .5-.5z"
          fill="none"
          stroke="currentColor"
          stroke-width="1.3"
          stroke-linejoin="round"
      />
      <path d="M9.1 2.4V6h3.4M6 10.5h4.2M6 12.5h2.8" fill="none" stroke="currentColor" stroke-width="1.3"
            stroke-linecap="round"/>
    </g>

    <!-- chart: bar chart -->
    <g v-else-if="step === 'chart'">
      <path d="M2.5 13.5V3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity="0.45"/>
      <rect x="4.5" y="8" width="2.2" height="5.5" rx=".4" fill="currentColor" opacity="0.85"/>
      <rect x="7.4" y="5.5" width="2.2" height="8" rx=".4" fill="currentColor"/>
      <rect x="10.3" y="7" width="2.2" height="6.5" rx=".4" fill="currentColor" opacity="0.7"/>
    </g>

    <!-- summary: document -->
    <g v-else-if="step === 'summary'">
      <path
          d="M4.5 2.2h4.6l3.7 3.7v7.4a.5.5 0 0 1-.5.5H4.5a.5.5 0 0 1-.5-.5V2.7a.5.5 0 0 1 .5-.5z"
          fill="none"
          stroke="currentColor"
          stroke-width="1.3"
          stroke-linejoin="round"
      />
      <path d="M9.1 2.4V6h3.4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      <path d="M5.5 8.5h5M5.5 10.8h3.8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"
            opacity="0.75"/>
    </g>

    <!-- fallback -->
    <circle v-else cx="8" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.3"/>
  </svg>
</template>

<style scoped>
.ai-step-icon {
  display: block;
  flex-shrink: 0;
}
</style>
