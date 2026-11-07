<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import type {TenantAiUsage} from '@/shared/api/types'
import {buildAiCapabilityUsageRows} from '@/features/ai/shared/services/tenant-ai-usage-breakdown'

const props = defineProps<{
  usage: TenantAiUsage | null | undefined
  nearLimit?: boolean
}>()

const {t} = useI18n()

const visible = computed(() => {
  const usage = props.usage
  return !!usage && !usage.unlimited && usage.limit > 0
})

const pct = computed(() => {
  const usage = props.usage
  if (!usage || usage.limit <= 0) return 0
  return Math.min(100, Math.round((usage.calls / usage.limit) * 100))
})

const rows = computed(() => buildAiCapabilityUsageRows(props.usage))
</script>

<template>
  <div
      v-if="visible"
      class="ai-quota-meter"
      :data-near="nearLimit ? 'true' : undefined"
      :aria-label="t('ai.quota.meterAria')"
  >
    <div class="ai-quota-meter__head">
      <span class="ai-quota-meter__label">{{ t('ai.quota.meterLabel') }}</span>
      <strong class="ai-quota-meter__value">
        {{ t('ai.quota.meterProgress', {calls: usage!.calls, limit: usage!.limit}) }}
      </strong>
    </div>
    <div
        class="ai-quota-meter__bar"
        role="progressbar"
        :aria-valuenow="pct"
        aria-valuemin="0"
        aria-valuemax="100"
    >
      <span class="ai-quota-meter__fill" :style="{width: `${pct}%`}"/>
    </div>
    <ul v-if="rows.length" class="ai-quota-meter__caps">
      <li v-for="row in rows" :key="row.id" class="ai-quota-meter__cap">
        <span>{{ t(row.labelKey) }}</span>
        <strong>{{ row.calls }}</strong>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.ai-quota-meter {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--dw-border-subtle);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-surface-muted);
}

.ai-quota-meter[data-near='true'] {
  border-color: color-mix(in srgb, var(--dw-warning) 45%, transparent);
}

.ai-quota-meter__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: var(--dw-text-xs);
}

.ai-quota-meter__label {
  color: var(--dw-text-muted);
}

.ai-quota-meter__value {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--dw-text);
}

.ai-quota-meter__bar {
  height: 4px;
  border-radius: var(--dw-radius-pill);
  background: color-mix(in srgb, var(--dw-border) 55%, transparent);
  overflow: hidden;
}

.ai-quota-meter__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--dw-accent);
}

.ai-quota-meter[data-near='true'] .ai-quota-meter__fill {
  background: var(--dw-warning);
}

.ai-quota-meter__caps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.85rem;
  font-size: var(--dw-text-2xs);
  color: var(--dw-text-muted);
}

.ai-quota-meter__cap {
  display: inline-flex;
  align-items: baseline;
  gap: 0.3rem;
}

.ai-quota-meter__cap strong {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--dw-text);
}
</style>
