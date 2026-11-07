<script setup lang="ts">
import { computed } from "vue";
import { formatRate } from "../lib/format";
import {
  summarizeResourceStrip,
  type ResourceLevel,
  type ResourceStripMetricsInput,
} from "../lib/metricsView";

const props = defineProps<{
  metrics?: ResourceStripMetricsInput | null;
  loading?: boolean;
  error?: string;
  t: (key: string, values?: Record<string, string | number>) => string;
}>();

const emit = defineEmits<{
  (e: "open-metrics"): void;
  (e: "open-copilot"): void;
}>();

const summary = computed(() => summarizeResourceStrip(props.metrics));

function formatPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "–";
  return `${Math.round(value)}%`;
}

function levelClass(level: ResourceLevel): string {
  return level === "ok" || level === "unknown" ? "" : `is-${level}`;
}
</script>

<template>
  <button
    type="button"
    class="resource-strip"
    :class="{ 'is-loading': loading && !metrics, 'has-error': !!error && !metrics }"
    :title="error || t('resourceStrip.hint')"
    :aria-label="t('resourceStrip.aria')"
    @click="emit('open-copilot')"
    @dblclick.stop="emit('open-metrics')"
  >
    <span class="resource-strip-item" :class="levelClass(summary.cpuLevel)">
      <span class="resource-strip-label">{{ t("resourceStrip.cpu") }}</span>
      <strong class="mono">{{ formatPercent(summary.cpuPercent) }}</strong>
    </span>
    <span class="resource-strip-item" :class="levelClass(summary.memLevel)">
      <span class="resource-strip-label">{{ t("resourceStrip.mem") }}</span>
      <strong class="mono">{{ formatPercent(summary.memPercent) }}</strong>
    </span>
    <span
      class="resource-strip-item"
      :class="levelClass(summary.diskLevel)"
      :title="summary.diskMount ? t('resourceStrip.diskMount', { mount: summary.diskMount }) : undefined"
    >
      <span class="resource-strip-label">{{ t("resourceStrip.disk") }}</span>
      <strong class="mono">{{ formatPercent(summary.diskPercent) }}</strong>
    </span>
    <span class="resource-strip-item resource-strip-net">
      <span class="resource-strip-label">{{ t("resourceStrip.net") }}</span>
      <strong class="mono">↓{{ formatRate(summary.rxRate) }} ↑{{ formatRate(summary.txRate) }}</strong>
    </span>
  </button>
</template>

<style scoped>
.resource-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 10px;
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--border);
  margin: 0;
  padding: 3px 10px;
  background: color-mix(in srgb, var(--muted) 35%, var(--background));
  color: var(--muted-foreground);
  font-size: var(--dw-text-xs);
  text-align: left;
  cursor: pointer;
}
.resource-strip:hover {
  background: color-mix(in srgb, var(--accent) 55%, var(--background));
  color: var(--foreground);
}
.resource-strip.is-loading,
.resource-strip.has-error {
  opacity: 0.72;
}
.resource-strip-item {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  min-width: 0;
}
.resource-strip-label {
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-size: var(--dw-text-2xs);
  opacity: 0.85;
}
.resource-strip-item strong {
  font-weight: 600;
  color: var(--foreground);
  font-variant-numeric: tabular-nums;
}
.resource-strip-item.is-warn strong {
  color: var(--warning, #d97706);
}
.resource-strip-item.is-critical strong {
  color: var(--destructive);
}
.resource-strip-net {
  margin-left: auto;
}
</style>
