<script setup lang="ts">
import { computed } from "vue";
import { Gauge, X } from "@lucide/vue";
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
  (e: "close"): void;
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
  <aside
    class="monitor-dock"
    :class="{ 'is-loading': loading && !metrics, 'has-error': !!error && !metrics }"
    :aria-label="t('monitorDock.aria')"
  >
    <header class="monitor-dock-head">
      <button type="button" class="monitor-dock-title" :title="t('monitorDock.hint')" @click="emit('open-metrics')">
        <Gauge />
        <span>{{ t("monitorDock.title") }}</span>
      </button>
      <button type="button" class="icon-button compact icon-neutral" :title="t('close')" @click="emit('close')">
        <X />
      </button>
    </header>
    <button
      type="button"
      class="monitor-dock-body"
      :title="error || t('monitorDock.hint')"
      @click="emit('open-metrics')"
    >
      <span class="monitor-dock-row" :class="levelClass(summary.cpuLevel)">
        <span class="monitor-dock-label">{{ t("resourceStrip.cpu") }}</span>
        <strong class="mono">{{ formatPercent(summary.cpuPercent) }}</strong>
      </span>
      <span class="monitor-dock-row" :class="levelClass(summary.memLevel)">
        <span class="monitor-dock-label">{{ t("resourceStrip.mem") }}</span>
        <strong class="mono">{{ formatPercent(summary.memPercent) }}</strong>
      </span>
      <span
        class="monitor-dock-row"
        :class="levelClass(summary.diskLevel)"
        :title="summary.diskMount ? t('resourceStrip.diskMount', { mount: summary.diskMount }) : undefined"
      >
        <span class="monitor-dock-label">{{ t("resourceStrip.disk") }}</span>
        <strong class="mono">{{ formatPercent(summary.diskPercent) }}</strong>
      </span>
      <span class="monitor-dock-row monitor-dock-net">
        <span class="monitor-dock-label">{{ t("resourceStrip.net") }}</span>
        <strong class="mono">↓{{ formatRate(summary.rxRate) }} ↑{{ formatRate(summary.txRate) }}</strong>
      </span>
    </button>
  </aside>
</template>
