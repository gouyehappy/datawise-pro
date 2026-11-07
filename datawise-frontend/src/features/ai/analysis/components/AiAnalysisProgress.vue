<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import AiAnalysisStepIcon from '@/features/ai/analysis/components/AiAnalysisStepIcon.vue'
import {
    formatStepRouteMessage,
    isStepCancelledByEarlierFailure,
    isStepEventStale,
    visibleAnalysisStepOrder,
} from '@/features/ai/analysis/services/analysis-step.service'
import type {AiAnalysisStepEvent} from '@/features/ai/types/analysis'

const props = withDefaults(
    defineProps<{
      steps: AiAnalysisStepEvent[]
      defaultExpanded?: boolean
      readonly?: boolean
      live?: boolean
      /** Narrow rail / assistant drawer density */
      compact?: boolean
    }>(),
    {compact: false},
)

const {t} = useI18n()

const expanded = ref(props.defaultExpanded ?? props.live ?? false)
const isBootstrapping = computed(() => props.live && props.steps.length === 0)

const visibleStepOrder = computed(() => visibleAnalysisStepOrder(props.steps))

const stepMap = computed(() => {
  const map = new Map<string, AiAnalysisStepEvent>()
  for (const step of props.steps) {
    map.set(step.step, step)
  }
  return map
})

function stepLabel(stepId: string): string {
  const key = `ai.analysis.steps.${stepId}`
  const translated = t(key)
  return translated === key ? stepId : translated
}

function stepMessage(stepId: string): string {
  const event = stepMap.value.get(stepId)
  if (stepId === 'step_route') {
    return formatStepRouteMessage(event, stepLabel, t('ai.analysis.skippedStepsPrefix'))
  }
  return event?.message ?? ''
}

function stepStatus(stepId: string): 'pending' | 'running' | 'ok' | 'failed' | 'skipped' {
  if (isBootstrapping.value) {
    return stepId === visibleStepOrder.value[0] ? 'running' : 'pending'
  }
  const event = stepMap.value.get(stepId)
  if (event && isStepEventStale(stepId as (typeof visibleStepOrder.value)[number], props.steps, visibleStepOrder.value)) {
    return 'pending'
  }
  if (!event) {
    const index = visibleStepOrder.value.indexOf(stepId as (typeof visibleStepOrder.value)[number])
    if (index >= 0) {
      if (isStepCancelledByEarlierFailure(stepId as (typeof visibleStepOrder.value)[number], props.steps)) {
        return 'skipped'
      }

      const laterCompleted = visibleStepOrder.value.slice(index + 1).some((laterId) => {
        const later = stepMap.value.get(laterId)
        return later?.status === 'ok' || later?.status === 'failed'
      })
      if (laterCompleted) return 'ok'
    }
    return 'pending'
  }
  if (event.status === 'running') return 'running'
  if (event.status === 'failed') return 'failed'
  return 'ok'
}

function isLineFlowing(index: number): boolean {
  const stepId = visibleStepOrder.value[index]
  const status = stepStatus(stepId)
  if (status !== 'ok') return false
  const nextId = visibleStepOrder.value[index + 1]
  return nextId ? stepStatus(nextId) === 'running' : false
}

function statusLabel(status: 'pending' | 'running' | 'ok' | 'failed' | 'skipped'): string {
  return t(`ai.analysis.progressStatus.${status}`)
}

function formatDuration(ms?: number | null): string | null {
  if (ms == null || ms < 0) return null
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

const doneCount = computed(() =>
    visibleStepOrder.value.filter((id) => {
      const status = stepStatus(id)
      return status === 'ok' || status === 'failed'
    }).length,
)

const hasFailed = computed(() =>
    visibleStepOrder.value.some((id) => stepStatus(id) === 'failed'),
)

const currentStepId = computed(() => {
  const running = visibleStepOrder.value.find((id) => stepStatus(id) === 'running')
  if (running) return running
  const failed = visibleStepOrder.value.find((id) => stepStatus(id) === 'failed')
  if (failed) return failed
  const firstPending = visibleStepOrder.value.find((id) => stepStatus(id) === 'pending')
  if (firstPending) return firstPending
  return visibleStepOrder.value[visibleStepOrder.value.length - 1] ?? 'intent'
})

const currentLabel = computed(() => stepLabel(currentStepId.value))

const currentMessage = computed(() => {
  if (isBootstrapping.value) return t('ai.analysis.bootstrapStarting')
  return stepMessage(currentStepId.value)
})

const headerStatus = computed(() => stepStatus(currentStepId.value))

const completedTrail = computed(() =>
    visibleStepOrder.value.filter((id) => stepStatus(id) === 'ok').map((id) => stepLabel(id)),
)

const isAllDone = computed(
    () =>
        visibleStepOrder.value.length > 0 &&
        visibleStepOrder.value.every((id) => {
          const status = stepStatus(id)
          return status === 'ok' || status === 'failed'
        }) &&
        !hasFailed.value,
)

/** Drawer tone: read as a process narrative, not a second “report card”. */
const eyebrowLabel = computed(() => {
  if (!props.compact) return t('ai.analysis.progressTitle')
  if (props.live && !props.readonly) return t('ai.pipelineProcessLive')
  return t('ai.pipelineProcess')
})

const progressPercent = computed(() => {
  const total = visibleStepOrder.value.length || 1
  let value = doneCount.value
  if (headerStatus.value === 'running') value += 0.35
  else if (headerStatus.value === 'failed') value += 0.15
  return Math.min(100, Math.round((value / total) * 100))
})

const showIndeterminateBar = computed(
    () => props.live && !props.readonly && isBootstrapping.value,
)

watch(
    () => props.live,
    (live) => {
      if (live && !props.readonly) expanded.value = true
    },
    {immediate: true},
)

watch(hasFailed, (failed) => {
  if (failed && !props.readonly) expanded.value = true
})

function toggleExpanded() {
  expanded.value = !expanded.value
}
</script>

<template>
  <div
      class="analysis-progress-panel"
      :class="{
      'is-expanded': expanded,
      'is-readonly': readonly,
      'is-complete': isAllDone,
      'is-live': live && !readonly,
      'is-compact': compact,
    }"
  >
    <div
        class="analysis-progress-panel__bar"
        :class="{ 'is-indeterminate': showIndeterminateBar }"
        aria-hidden="true"
    >
      <span
          class="analysis-progress-panel__bar-fill"
          :style="{ width: showIndeterminateBar ? undefined : `${progressPercent}%` }"
      />
    </div>

    <button
        class="analysis-progress-panel__header"
        type="button"
        :aria-expanded="expanded"
        :disabled="live && !readonly"
        @click="toggleExpanded"
    >
      <div class="analysis-progress-panel__summary">
        <span
            class="analysis-progress-panel__header-icon"
            :class="headerStatus"
            aria-hidden="true"
        >
          <AiAnalysisStepIcon :step="currentStepId" :size="14"/>
        </span>
        <div class="analysis-progress-panel__titles">
          <span class="analysis-progress-panel__eyebrow">{{ eyebrowLabel }}</span>
          <span class="analysis-progress-panel__current">
            {{ isAllDone ? t('ai.analysis.progressAllDone') : currentLabel }}
          </span>
          <span
              v-if="!expanded && (currentMessage || completedTrail.length)"
              class="analysis-progress-panel__message"
          >
            <template v-if="isAllDone && completedTrail.length">
              {{ completedTrail.join(' ? ') }}
            </template>
            <template v-else-if="currentMessage">
              {{ currentMessage }}
            </template>
          </span>
        </div>
      </div>

      <div class="analysis-progress-panel__meta">
        <span class="analysis-progress-panel__count">
          {{ t('ai.analysis.progressStepCount', {done: doneCount, total: visibleStepOrder.length}) }}
        </span>
        <span class="analysis-progress-panel__chevron" aria-hidden="true"/>
      </div>
    </button>

    <div
        class="analysis-progress-panel__track"
        :style="{ gridTemplateColumns: `repeat(${Math.max(visibleStepOrder.length, 1)}, minmax(0, 1fr))` }"
        aria-hidden="true"
    >
      <div
          v-for="(stepId, index) in visibleStepOrder"
          :key="stepId"
          class="analysis-progress-panel__track-item"
          :class="stepStatus(stepId)"
          :title="stepLabel(stepId)"
      >
        <span class="analysis-progress-panel__track-node">
          <span
              v-if="stepStatus(stepId) === 'running'"
              class="analysis-progress-panel__track-ring"
              aria-hidden="true"
          />
              <AiAnalysisStepIcon :step="stepId" :size="11"/>
          <span v-if="stepStatus(stepId) === 'ok'" class="analysis-progress-panel__track-done" aria-hidden="true">
            ??          </span>
          <span
              v-else-if="stepStatus(stepId) === 'failed'"
              class="analysis-progress-panel__track-fail"
              aria-hidden="true"
          >
            ?
          </span>
        </span>
        <span class="analysis-progress-panel__track-label">{{ stepLabel(stepId) }}</span>
        <span
            v-if="index < visibleStepOrder.length - 1"
            class="analysis-progress-panel__track-line"
            :class="{
            'is-done': stepStatus(stepId) === 'ok' && !isLineFlowing(index),
            'is-flowing': isLineFlowing(index),
          }"
        />
      </div>
    </div>

    <div v-if="live && !readonly && !isAllDone" class="analysis-progress-panel__live-footer">
      <span class="analysis-progress-panel__live-icon" :class="headerStatus">
        <AiAnalysisStepIcon :step="currentStepId" :size="15"/>
      </span>
      <span class="analysis-progress-panel__live-text">
        {{ currentMessage || t('ai.analysis.bootstrapStarting') }}
      </span>
    </div>

    <div v-show="expanded" class="analysis-progress-panel__body">
      <ol class="analysis-progress" :aria-label="t('ai.analysis.progressTitle')">
        <li
            v-for="(stepId, index) in visibleStepOrder"
            :key="stepId"
            class="analysis-progress__item"
            :class="[
            stepStatus(stepId),
            { 'analysis-progress__item--last': index === visibleStepOrder.length - 1 },
          ]"
        >
          <div class="analysis-progress__track" aria-hidden="true">
            <span class="analysis-progress__marker" :class="stepStatus(stepId)">
              <AiAnalysisStepIcon :step="stepId" :size="11"/>
            </span>
            <span
                v-if="index < visibleStepOrder.length - 1"
                class="analysis-progress__line"
                :class="{ 'analysis-progress__line--done': stepStatus(stepId) === 'ok' }"
            />
          </div>
          <div class="analysis-progress__text">
            <div class="analysis-progress__row">
              <span class="analysis-progress__label">{{ stepLabel(stepId) }}</span>
              <span class="analysis-progress__status" :class="stepStatus(stepId)">
                {{ statusLabel(stepStatus(stepId)) }}
              </span>
              <span
                  v-if="formatDuration(stepMap.get(stepId)?.durationMs)"
                  class="analysis-progress__duration"
              >
                {{ formatDuration(stepMap.get(stepId)?.durationMs) }}
              </span>
            </div>
            <span v-if="stepMessage(stepId)" class="analysis-progress__message">
              {{ stepMessage(stepId) }}
            </span>
          </div>
        </li>
      </ol>
    </div>
  </div>
</template>

<style scoped>
.analysis-progress-panel {
  position: relative;
  border-bottom: 1px solid var(--dw-border-light);
  background: var(--dw-bg-panel);
}

.analysis-progress-panel.is-live {
  background: color-mix(in srgb, var(--dw-primary) 4%, var(--dw-bg-panel));
}

.analysis-progress-panel__bar {
  height: 3px;
  background: color-mix(in srgb, var(--dw-text) 6%, transparent);
  overflow: hidden;
}

.analysis-progress-panel__bar-fill {
  display: block;
  height: 100%;
  border-radius: 0 var(--dw-radius-xs) var(--dw-radius-xs) 0;
  background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--dw-primary) 75%, transparent),
      var(--dw-primary)
  );
  transition: width 0.9s cubic-bezier(0.4, 0, 0.2, 1);
}

.analysis-progress-panel__bar.is-indeterminate .analysis-progress-panel__bar-fill {
  width: 32% !important;
  animation: bar-indeterminate 3.2s ease-in-out infinite;
}

.analysis-progress-panel.is-complete .analysis-progress-panel__bar-fill {
  background: linear-gradient(90deg, var(--dw-primary), color-mix(in srgb, var(--dw-primary) 70%, var(--dw-success)));
}

.analysis-progress-panel.is-readonly {
  background: color-mix(in srgb, var(--dw-bg) 25%, var(--dw-bg-panel));
}

.analysis-progress-panel.is-complete .analysis-progress-panel__current {
  color: var(--dw-text-secondary);
}

.analysis-progress-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-space-6);
  width: 100%;
  padding: 13px var(--dw-space-8) var(--dw-space-5);
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background var(--dw-duration) var(--dw-ease);
}

.analysis-progress-panel__header:hover:not(:disabled) {
  background: color-mix(in srgb, var(--dw-primary) 4%, transparent);
}

.analysis-progress-panel__header:disabled {
  cursor: default;
}

.analysis-progress-panel__summary {
  display: flex;
  align-items: flex-start;
  gap: var(--dw-gap-md);
  min-width: 0;
}

.analysis-progress-panel__header-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: var(--dw-btn-height);
  margin-top: 1px;
  border-radius: var(--dw-control-radius);
  border: 1px solid color-mix(in srgb, var(--dw-text) 14%, transparent);
  background: var(--dw-bg);
  color: var(--dw-text-muted);
  flex-shrink: 0;
}

.analysis-progress-panel__header-icon.running {
  border-color: color-mix(in srgb, var(--dw-primary) 45%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-primary) 8%, var(--dw-bg));
  color: var(--dw-primary);
}

.analysis-progress-panel__header-icon.ok {
  border-color: color-mix(in srgb, var(--dw-primary) 40%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-primary) 10%, var(--dw-bg));
  color: var(--dw-primary);
}

.analysis-progress-panel__header-icon.failed {
  border-color: color-mix(in srgb, var(--dw-danger) 40%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-danger) 8%, var(--dw-bg));
  color: var(--dw-danger);
}

.analysis-progress-panel__titles {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-1);
  min-width: 0;
}

.analysis-progress-panel__eyebrow {
  font-size: var(--dw-text-xs);
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--dw-text-muted);
}

.analysis-progress-panel__current {
  font-size: var(--dw-text-md);
  font-weight: 600;
  line-height: var(--dw-leading-snug);
  color: var(--dw-text);
}

.analysis-progress-panel__message {
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
  color: var(--dw-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.analysis-progress-panel__meta {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-md);
  flex-shrink: 0;
}

.analysis-progress-panel__count {
  padding: var(--dw-space-2) var(--dw-space-5);
  border-radius: var(--dw-radius-pill);
  border: 1px solid color-mix(in srgb, var(--dw-primary) 20%, var(--dw-border-light));
  background: color-mix(in srgb, var(--dw-bg) 85%, var(--dw-primary-soft));
  color: var(--dw-primary);
  font-size: var(--dw-text-xs);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.analysis-progress-panel__chevron {
  width: 8px;
  height: 8px;
  border-right: 2px solid var(--dw-text-muted);
  border-bottom: 2px solid var(--dw-text-muted);
  transform: rotate(45deg);
  transition: transform var(--dw-duration-slow) var(--dw-ease);
}

.analysis-progress-panel.is-expanded .analysis-progress-panel__chevron {
  transform: rotate(-135deg) translate(-1px, 1px);
}

.analysis-progress-panel__track {
  display: grid;
  gap: 0;
  padding: var(--dw-space-1) var(--dw-space-6) var(--dw-space-7);
}

.analysis-progress-panel__track-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--dw-gap-sm);
  min-width: 0;
  padding: 0 var(--dw-space-1);
}

.analysis-progress-panel__track-node {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: var(--dw-btn-height);
  border-radius: var(--dw-control-radius);
  border: 1px solid color-mix(in srgb, var(--dw-text) 12%, transparent);
  background: var(--dw-bg);
  color: var(--dw-text-muted);
  z-index: 1;
  transition: border-color 0.5s ease,
  background 0.5s ease,
  color 0.5s ease,
  opacity 0.5s ease;
}

.analysis-progress-panel__track-item.pending .analysis-progress-panel__track-node {
  opacity: 0.42;
}

.analysis-progress-panel__track-item.running .analysis-progress-panel__track-node {
  opacity: 1;
  border-color: color-mix(in srgb, var(--dw-primary) 50%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-primary) 10%, var(--dw-bg));
  color: var(--dw-primary);
}

.analysis-progress-panel__track-item.ok .analysis-progress-panel__track-node {
  opacity: 1;
  border-color: color-mix(in srgb, var(--dw-primary) 35%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-primary) 12%, var(--dw-bg));
  color: var(--dw-primary);
}

.analysis-progress-panel__track-item.skipped .analysis-progress-panel__track-node {
  opacity: 0.85;
  border-color: color-mix(in srgb, var(--dw-text-muted) 35%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-bg-panel) 80%, var(--dw-bg));
  color: var(--dw-text-muted);
}

.analysis-progress-panel__track-item.failed .analysis-progress-panel__track-node {
  opacity: 1;
  border-color: color-mix(in srgb, var(--dw-danger) 45%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-danger) 8%, var(--dw-bg));
  color: var(--dw-danger);
}

.analysis-progress-panel__track-ring {
  position: absolute;
  inset: -4px;
  border-radius: var(--dw-control-radius);
  border: 1.5px solid transparent;
  border-top-color: color-mix(in srgb, var(--dw-primary) 70%, transparent);
  border-right-color: color-mix(in srgb, var(--dw-primary) 20%, transparent);
  animation: step-ring-spin 3.6s linear infinite;
  pointer-events: none;
}

.analysis-progress-panel__track-done,
.analysis-progress-panel__track-skip,
.analysis-progress-panel__track-fail {
  position: absolute;
  right: -3px;
  bottom: -3px;
  width: var(--dw-icon-size-xs);
  height: var(--dw-icon-size-xs);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--dw-text-2xs);
  font-weight: 700;
  line-height: 1;
  border: 1px solid var(--dw-bg-panel);
}

.analysis-progress-panel__track-done {
  background: var(--dw-primary);
  color: var(--dw-on-accent);
}

.analysis-progress-panel__track-skip {
  background: var(--dw-text-muted);
  color: var(--dw-on-accent);
}

.analysis-progress-panel__track-fail {
  background: var(--dw-danger);
  color: var(--dw-on-accent);
}

.analysis-progress-panel__track-label {
  width: 100%;
  font-size: var(--dw-text-2xs);
  font-weight: 600;
  line-height: var(--dw-leading-tight);
  text-align: center;
  color: var(--dw-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 0.5s ease;
}

.analysis-progress-panel__track-item.running .analysis-progress-panel__track-label {
  color: var(--dw-primary);
}

.analysis-progress-panel__track-item.ok .analysis-progress-panel__track-label {
  color: var(--dw-text-secondary);
}

.analysis-progress-panel__track-line {
  position: absolute;
  top: 14px;
  left: calc(50% + 16px);
  right: calc(-50% + 16px);
  height: 2px;
  border-radius: var(--dw-radius-xs);
  background: color-mix(in srgb, var(--dw-text) 10%, transparent);
  z-index: 0;
  transition: background 0.5s ease;
}

.analysis-progress-panel__track-line.is-done {
  background: color-mix(in srgb, var(--dw-primary) 35%, transparent);
}

.analysis-progress-panel__track-line.is-flowing {
  background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--dw-primary) 20%, transparent) 0%,
      color-mix(in srgb, var(--dw-primary) 55%, transparent) 45%,
      color-mix(in srgb, var(--dw-primary) 20%, transparent) 100%
  );
  background-size: 220% 100%;
  animation: line-flow 3.5s ease-in-out infinite;
}

.analysis-progress-panel__live-footer {
  display: flex;
  align-items: center;
  gap: var(--dw-space-6);
  padding: var(--dw-space-5) var(--dw-space-8) var(--dw-space-7);
  border-top: 1px solid color-mix(in srgb, var(--dw-border-light) 90%, transparent);
  background: color-mix(in srgb, var(--dw-bg) 50%, var(--dw-bg-panel));
}

.analysis-progress-panel__live-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: var(--dw-control-h-sm);
  border-radius: var(--dw-control-radius);
  border: 1px solid color-mix(in srgb, var(--dw-primary) 30%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-primary) 8%, var(--dw-bg));
  color: var(--dw-primary);
  flex-shrink: 0;
}

.analysis-progress-panel__live-text {
  flex: 1;
  min-width: 0;
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading-relaxed);
  color: var(--dw-text-secondary);
}

.analysis-progress-panel__body {
  padding: 0 var(--dw-space-8) var(--dw-space-8);
  border-top: 1px solid color-mix(in srgb, var(--dw-border-light) 80%, transparent);
  background: color-mix(in srgb, var(--dw-bg) 60%, var(--dw-bg-panel));
}

.analysis-progress {
  list-style: none;
  margin: var(--dw-space-6) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 0;
}

.analysis-progress__item {
  display: flex;
  align-items: flex-start;
  gap: var(--dw-gap-md);
  min-height: var(--dw-density-lg);
  color: var(--dw-text-muted);
}

.analysis-progress__item.running {
  color: var(--dw-primary);
  padding: var(--dw-space-3) var(--dw-space-5);
  margin: 0 -var(--dw-space-5);
  border-radius: var(--dw-panel-radius);
  background: color-mix(in srgb, var(--dw-primary) 5%, transparent);
}

.analysis-progress__item.ok {
  color: var(--dw-text-secondary);
}

.analysis-progress__item.failed {
  color: var(--dw-danger);
}

.analysis-progress__track {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: var(--dw-control-h-xs);
  align-self: stretch;
}

.analysis-progress__marker {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--dw-control-h-xs);
  height: var(--dw-control-h-xs);
  border-radius: var(--dw-control-radius-sm);
  border: 1px solid color-mix(in srgb, var(--dw-text) 14%, transparent);
  background: var(--dw-bg-panel);
  color: var(--dw-text-muted);
  flex-shrink: 0;
}

.analysis-progress__marker.running {
  border-color: color-mix(in srgb, var(--dw-primary) 40%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-primary) 8%, var(--dw-bg-panel));
  color: var(--dw-primary);
}

.analysis-progress__marker.ok {
  border-color: color-mix(in srgb, var(--dw-primary) 35%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-primary) 10%, var(--dw-bg-panel));
  color: var(--dw-primary);
}

.analysis-progress__marker.failed {
  border-color: color-mix(in srgb, var(--dw-danger) 40%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-danger) 8%, var(--dw-bg-panel));
  color: var(--dw-danger);
}

.analysis-progress__line {
  flex: 1;
  width: 2px;
  min-height: 8px;
  margin: var(--dw-space-1) 0;
  border-radius: var(--dw-radius-xs);
  background: color-mix(in srgb, var(--dw-text) 12%, transparent);
}

.analysis-progress__line--done {
  background: color-mix(in srgb, var(--dw-primary) 35%, transparent);
}

.analysis-progress__text {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-xs);
  min-width: 0;
  flex: 1;
  padding: 1px 0 var(--dw-space-5);
}

.analysis-progress__item--last .analysis-progress__text {
  padding-bottom: 0;
}

.analysis-progress__row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--dw-gap-sm);
}

.analysis-progress__label {
  font-size: var(--dw-text-sm);
  font-weight: 600;
  line-height: var(--dw-leading-snug);
}

.analysis-progress__item.pending .analysis-progress__label {
  font-weight: 500;
}

.analysis-progress__status {
  padding: 1px var(--dw-space-3);
  border-radius: var(--dw-radius-pill);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  line-height: var(--dw-leading);
  border: 1px solid var(--dw-border-light);
  background: var(--dw-bg);
  color: var(--dw-text-muted);
}

.analysis-progress__status.running {
  border-color: color-mix(in srgb, var(--dw-primary) 30%, var(--dw-border));
  background: var(--dw-primary-soft);
  color: var(--dw-primary);
}

.analysis-progress__status.ok {
  border-color: color-mix(in srgb, var(--dw-primary) 24%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-primary) 8%, var(--dw-bg));
  color: var(--dw-primary);
}

.analysis-progress__status.failed {
  border-color: color-mix(in srgb, var(--dw-danger) 30%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-danger) 8%, var(--dw-bg));
  color: var(--dw-danger);
}

.analysis-progress__status.skipped {
  border-color: var(--dw-border-light);
  background: color-mix(in srgb, var(--dw-bg-panel) 80%, var(--dw-bg));
  color: var(--dw-text-muted);
}

.analysis-progress__duration {
  font-size: var(--dw-text-xs);
  font-weight: 500;
  color: var(--dw-text-muted);
  font-variant-numeric: tabular-nums;
}

.analysis-progress__message {
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading-relaxed);
  color: var(--dw-text-secondary);
  white-space: pre-line;
}

.analysis-progress__item.running .analysis-progress__message {
  color: color-mix(in srgb, var(--dw-primary) 75%, var(--dw-text));
}

@keyframes step-ring-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes bar-indeterminate {
  0% {
    transform: translateX(-130%);
  }
  100% {
    transform: translateX(330%);
  }
}

@keyframes line-flow {
  0% {
    background-position: 120% 0;
  }
  100% {
    background-position: -120% 0;
  }
}

/* Assistant drawer / narrow rail */
.analysis-progress-panel.is-compact {
  border-bottom-color: color-mix(in srgb, var(--dw-border) 70%, transparent);
}

.analysis-progress-panel.is-compact .analysis-progress-panel__header {
  padding: 8px var(--dw-space-4) 6px;
  gap: var(--dw-space-3);
}

.analysis-progress-panel.is-compact .analysis-progress-panel__header-icon {
  width: 22px;
  height: 22px;
  margin-top: 0;
}

.analysis-progress-panel.is-compact .analysis-progress-panel__eyebrow {
  font-size: var(--dw-text-2xs);
  letter-spacing: 0.04em;
}

.analysis-progress-panel.is-compact .analysis-progress-panel__current {
  font-size: var(--dw-text-sm);
}

.analysis-progress-panel.is-compact .analysis-progress-panel__message {
  -webkit-line-clamp: 1;
  font-size: var(--dw-text-xs);
}

.analysis-progress-panel.is-compact .analysis-progress-panel__count {
  font-size: var(--dw-text-xs);
}

.analysis-progress-panel.is-compact .analysis-progress-panel__track {
  padding: 0 var(--dw-space-4) 8px;
  gap: 4px;
}

.analysis-progress-panel.is-compact:not(.is-expanded) .analysis-progress-panel__track {
  display: none;
}

.analysis-progress-panel.is-compact .analysis-progress-panel__live-footer {
  padding: 6px var(--dw-space-4) 8px;
  gap: var(--dw-space-2);
  font-size: var(--dw-text-xs);
}

.analysis-progress-panel.is-compact .analysis-progress-panel__body {
  padding: 0 var(--dw-space-4) var(--dw-space-3);
}

.analysis-progress-panel.is-compact .analysis-progress__item {
  gap: var(--dw-space-2);
}

.analysis-progress-panel.is-compact .analysis-progress__label {
  font-size: var(--dw-text-xs);
}

.analysis-progress-panel.is-compact .analysis-progress__message {
  font-size: var(--dw-text-xs);
}

@media (max-width: 720px) {
  .analysis-progress-panel__track {
    display: flex;
    overflow-x: auto;
    gap: var(--dw-gap-md);
    padding-bottom: var(--dw-space-6);
  }

  .analysis-progress-panel__track-item {
    flex: 0 0 64px;
  }

  .analysis-progress-panel__track-line {
    display: none;
  }
}
</style>
