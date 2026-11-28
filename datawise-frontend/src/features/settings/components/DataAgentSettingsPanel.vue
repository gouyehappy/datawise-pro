<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {
  AI_ANALYSIS_CONFIGURABLE_STEPS,
  type AiAnalysisConfigurableStepId,
  type AiAnalysisMode,
} from '@/features/ai/types/analysis'
import {disabledStepsForMode} from '@/features/ai/analysis/services/analysis-step.service'
import {
  fetchAiPythonRuntime,
  type AiPythonRuntime,
} from '@/features/ai/services/ai-python-runtime.service'
import {
  AI_LLM_ROUTE_STEPS,
} from '@/features/ai/shared/services/ai-llm-routing.service'
import type {AiAnalysisLlmRouteStep} from '@/shared/config/app-config.types'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {UserResource} from '@/features/auth/types/user-resource.types'
import {useResourceWriteGuard} from '@/features/auth/composables/useResourceWriteGuard'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import SettingsTipsCard from '@/features/settings/components/SettingsTipsCard.vue'
import SettingsGroup from '@/features/settings/components/SettingsGroup.vue'
import SettingsSelect from '@/core/components/SettingsSelect.vue'
import {StatusPill, DwInlineAlert, DwInput, SettingsRow, SettingsSwitch} from '@/core/components'
import type {SelectOption} from '@/core/components/select.types'
import {
  ASSISTANT_HISTORY_LIMIT_MAX,
  ASSISTANT_HISTORY_LIMIT_MIN,
  clampAssistantHistoryLimit,
} from '@/features/ai/chat/services/ai-chat-persistence.service'

const props = withDefaults(defineProps<{
  embedded?: boolean
}>(), {
  embedded: false,
})

const {t} = useI18n()
const appConfig = useAppConfigStore()
const layout = useLayoutStore()
const {readOnly, hint, denyIfReadOnly} = useResourceWriteGuard(UserResource.AiPreferences)

const pythonRuntime = ref<AiPythonRuntime | null>(null)
const pythonRuntimeLoading = ref(false)
const pythonRuntimeError = ref('')
const analysisStepError = ref('')

const ANALYSIS_MODES: AiAnalysisMode[] = ['quick', 'smart', 'custom']

const assistantHistoryLimit = computed({
  get: () => clampAssistantHistoryLimit(appConfig.aiPreferences.assistantHistoryLimit),
  set: (value: number) => {
    if (denyIfReadOnly()) return
    appConfig.patchAiPreferences({
      assistantHistoryLimit: clampAssistantHistoryLimit(value),
    })
  },
})

const skipSqlConfirmation = computed({
  get: () => appConfig.aiPreferences.skipSqlConfirmation === true,
  set: (value: boolean) => {
    if (denyIfReadOnly()) return
    appConfig.setSkipSqlConfirmation(value)
  },
})

const analysisMode = computed(() => appConfig.aiPreferences.analysisMode ?? 'smart')

const showCustomSteps = computed(() => analysisMode.value === 'custom')

function analysisModeTitle(mode: AiAnalysisMode): string {
  return t(`settings.dataAgent.analysisPreset${mode === 'custom' ? 'CustomMode' : mode === 'quick' ? 'Quick' : 'Smart'}`)
}

function analysisModeDesc(mode: AiAnalysisMode): string {
  return t(`settings.dataAgent.analysisPreset${mode === 'custom' ? 'CustomMode' : mode === 'quick' ? 'Quick' : 'Smart'}Hint`)
}

const analysisModeOptions = computed(() =>
  ANALYSIS_MODES.map((mode) => ({
    value: mode,
    label: analysisModeTitle(mode),
  })),
)

const analysisModeHint = computed(() => analysisModeDesc(analysisMode.value))

const llmProfiles = computed(() => appConfig.aiPreferences.llmProfiles)

const defaultRouteProfileId = computed(
    () => appConfig.aiPreferences.workbenchLlmId || appConfig.aiPreferences.defaultLlmId,
)

const defaultRouteProfileName = computed(
    () => llmProfiles.value.find((profile) => profile.id === defaultRouteProfileId.value)?.name ?? '',
)

function routeProfileId(step: AiAnalysisLlmRouteStep): string {
  return appConfig.aiPreferences.analysisStepLlmIds?.[step] ?? ''
}

function setRouteProfile(step: AiAnalysisLlmRouteStep, profileId: string) {
  if (denyIfReadOnly()) return
  appConfig.setAnalysisStepLlmId(step, profileId)
}

const llmRouteOptions = computed<SelectOption[]>(() => [
  {value: '', label: t('settings.dataAgent.llmRouteDefault')},
  ...llmProfiles.value.map((profile) => ({value: profile.id, label: profile.name})),
])

function applyAnalysisMode(mode: AiAnalysisMode) {
  if (denyIfReadOnly()) return
  appConfig.setAnalysisMode(mode)
  if (mode === 'quick') {
    appConfig.setDisabledAnalysisSteps(disabledStepsForMode('quick'))
  } else if (mode === 'smart') {
    appConfig.setDisabledAnalysisSteps([])
  }
  analysisStepError.value = ''
}

function isAnalysisStepEnabled(step: AiAnalysisConfigurableStepId): boolean {
  return !(appConfig.aiPreferences.disabledAnalysisSteps ?? []).includes(step)
}

function setAnalysisStepEnabled(step: AiAnalysisConfigurableStepId, enabled: boolean) {
  if (denyIfReadOnly()) return
  appConfig.setAnalysisMode('custom')
  const disabled = new Set(appConfig.aiPreferences.disabledAnalysisSteps ?? [])
  if (enabled) {
    disabled.delete(step)
  } else {
    disabled.add(step)
    const summaryOff = disabled.has('summary')
    const reportOff = disabled.has('report')
    if (summaryOff && reportOff) {
      analysisStepError.value = t('settings.dataAgent.analysisStepsKeepOne')
      disabled.delete(step)
      return
    }
  }
  analysisStepError.value = ''
  appConfig.setDisabledAnalysisSteps([...disabled])
}

const runtimeSpecs = computed(() => {
  const runtime = pythonRuntime.value
  if (!runtime) return []
  const yes = t('common.yes')
  const no = t('common.no')
  const f = (key: string) => t(`settings.dataAgent.pythonRuntimeFields.${key}`)
  const specs: {key: string; label: string; value: string; mono?: boolean; variant?: 'success' | 'neutral' | 'warn'}[] = [
    {
      key: 'enabled',
      label: f('enabled'),
      value: runtime.enabled ? yes : no,
      variant: runtime.enabled ? 'success' : 'neutral',
    },
    {key: 'executor', label: f('executor'), value: runtime.executor, mono: true},
    {
      key: 'sandbox',
      label: f('sandbox'),
      value: runtime.sandboxEnabled ? yes : no,
      variant: runtime.sandboxEnabled ? 'success' : 'neutral',
    },
    {
      key: 'dependencyInstall',
      label: f('dependencyInstall'),
      value: runtime.dependencyInstallEnabled ? yes : no,
      variant: runtime.dependencyInstallEnabled ? 'success' : 'neutral',
    },
    {
      key: 'timeout',
      label: f('timeout'),
      value: String(runtime.timeoutSeconds),
      mono: true,
    },
    {
      key: 'dependencyTimeout',
      label: f('dependencyTimeout'),
      value: String(runtime.dependencyInstallTimeoutSeconds),
      mono: true,
    },
    {
      key: 'maxRetries',
      label: f('maxRetries'),
      value: String(runtime.maxRetries),
      mono: true,
    },
  ]
  if (runtime.dockerImage) {
    specs.splice(4, 0, {
      key: 'dockerImage',
      label: f('dockerImage'),
      value: runtime.dockerImage,
      mono: true,
    })
  }
  if (runtime.k8sNamespace) {
    specs.splice(runtime.dockerImage ? 5 : 4, 0, {
      key: 'k8sNamespace',
      label: f('k8sNamespace'),
      value: runtime.k8sNamespace,
      mono: true,
    })
  }
  return specs
})

async function loadPythonRuntime() {
  pythonRuntimeLoading.value = true
  pythonRuntimeError.value = ''
  try {
    pythonRuntime.value = await fetchAiPythonRuntime()
  } catch {
    pythonRuntimeError.value = t('settings.dataAgent.pythonRuntimeLoadFailed')
  } finally {
    pythonRuntimeLoading.value = false
  }
}

onMounted(() => {
  void loadPythonRuntime()
})
</script>

<template>
  <SettingsPageShell
      :embedded="props.embedded"
      :title="t('settings.dataAgent.title')"
      :subtitle="t('settings.dataAgent.subtitle')"
      :readonly="readOnly"
      :readonly-hint="hint"
  >
    <template v-if="!props.embedded" #tips>
      <SettingsTipsCard
          :title="t('settings.dataAgent.title')"
          :content="t('settings.dataAgent.subtitle')"
          icon="settings-data-agent"
      />
    </template>

    <div class="settings-groups settings-stack">
      <SettingsGroup
          :title="t('settings.dataAgent.executionTitle')"
          :hint="t('settings.dataAgent.executionHint')"
      >
        <SettingsSwitch
            :label="t('settings.dataAgent.skipSqlConfirmation')"
            :hint="t('settings.dataAgent.skipSqlConfirmationHint')"
            :model-value="skipSqlConfirmation"
            :disabled="readOnly"
            @update:model-value="skipSqlConfirmation = $event"
        />
        <SettingsRow
            :label="t('settings.dataAgent.assistantHistoryLimit')"
            :hint="t('settings.dataAgent.assistantHistoryLimitHint')"
            :disabled="readOnly"
        >
          <div class="input-with-unit">
            <DwInput
                id="assistant-history-limit"
                type="number"
                :min="ASSISTANT_HISTORY_LIMIT_MIN"
                :max="ASSISTANT_HISTORY_LIMIT_MAX"
                :disabled="readOnly"
                :model-value="assistantHistoryLimit"
                @update:model-value="assistantHistoryLimit = Number($event)"
            />
            <span class="unit-chip">{{ t('settings.dataAgent.assistantHistoryLimitUnit') }}</span>
          </div>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
          :title="t('settings.dataAgent.analysisStepsTitle')"
          :hint="t('settings.dataAgent.analysisStepsHint')"
      >
        <SettingsRow
            :label="t('settings.dataAgent.analysisPresetGroup')"
            :hint="analysisModeHint"
            :disabled="readOnly"
        >
          <SettingsSelect
              id="data-agent-analysis-mode"
              :model-value="analysisMode"
              :options="analysisModeOptions"
              :disabled="readOnly"
              @update:model-value="(v) => applyAnalysisMode(v as AiAnalysisMode)"
          />
        </SettingsRow>
        <div v-if="analysisMode === 'smart'" class="settings-section__block">
          <p class="settings-section__block-hint">{{ t('settings.dataAgent.analysisSmartRuntimeHint') }}</p>
        </div>
        <template v-if="showCustomSteps">
          <SettingsSwitch
              v-for="step in AI_ANALYSIS_CONFIGURABLE_STEPS"
              :key="step"
              :label="t(`ai.analysis.steps.${step}`)"
              :hint="t(`settings.dataAgent.analysisStepHints.${step}`)"
              :model-value="isAnalysisStepEnabled(step)"
              :disabled="readOnly"
              @update:model-value="(v) => setAnalysisStepEnabled(step, v)"
          />
          <div v-if="analysisStepError" class="settings-section__block">
            <DwInlineAlert :message="analysisStepError"/>
          </div>
        </template>
      </SettingsGroup>

      <SettingsGroup
          :title="t('settings.dataAgent.llmRoutingTitle')"
          :hint="t('settings.dataAgent.llmRoutingHint')"
      >
        <SettingsRow
            v-for="step in AI_LLM_ROUTE_STEPS"
            :key="step"
            :label="t(`settings.dataAgent.llmRouteSteps.${step}`)"
            :hint="t(`settings.dataAgent.llmRouteHints.${step}`)"
        >
          <SettingsSelect
              :model-value="routeProfileId(step)"
              :options="llmRouteOptions"
              @update:model-value="setRouteProfile(step, $event)"
          />
        </SettingsRow>
        <div class="settings-section__block">
          <p class="settings-section__block-hint">
            {{ t('settings.dataAgent.llmRouteFallbackHint', {name: defaultRouteProfileName}) }}
          </p>
        </div>
      </SettingsGroup>

      <SettingsGroup
          :title="t('settings.dataAgent.pythonRuntimeTitle')"
          :hint="t('settings.dataAgent.pythonRuntimeHint')"
      >
        <div class="settings-section__block">
          <p v-if="pythonRuntimeLoading" class="runtime-loading">
            <span class="runtime-loading__dot" aria-hidden="true"/>
            {{ t('settings.dataAgent.pythonRuntimeLoading') }}
          </p>

          <DwInlineAlert v-else-if="pythonRuntimeError" :message="pythonRuntimeError"/>

          <div v-else-if="pythonRuntime" class="runtime-spec-grid">
            <div
                v-for="spec in runtimeSpecs"
                :key="spec.key"
                class="runtime-spec"
            >
              <span class="runtime-spec__label">{{ spec.label }}</span>
              <StatusPill
                  v-if="spec.variant"
                  :variant="spec.variant"
                  chip
              >
                {{ spec.value }}
              </StatusPill>
              <span v-else class="runtime-spec__value" :class="{'is-mono': spec.mono}">{{ spec.value }}</span>
            </div>
          </div>
        </div>
      </SettingsGroup>
    </div>
  </SettingsPageShell>
</template>

<style scoped>
.settings-stack {
  display: flex;
  flex-direction: column;
  gap: var(--mp-gap-lg);
}

.mode-pick-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--dw-gap-md);
}

.mode-pick {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--dw-gap-md);
  padding: clamp(10px, 1.2vmin, 12px) clamp(10px, 1.2vmin, 12px) clamp(10px, 1.2vmin, 12px) clamp(9px, 1.1vmin, 11px);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-panel);
  text-align: left;
  cursor: pointer;
  transition: var(--dw-transition-colors), box-shadow var(--dw-duration) var(--dw-ease),
      transform 0.12s ease;
}

.mode-pick:hover {
  border-color: color-mix(in srgb, var(--dw-text) 26%, var(--dw-border));
  background: var(--dw-bg-hover);
}

.mode-pick.is-active {
  border-color: var(--dw-border-strong, var(--dw-text-secondary));
  background: var(--dw-bg-hover);
  box-shadow: none;
}

.mode-pick__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: var(--dw-control-h-sm);
  height: var(--dw-control-h-sm);
  border-radius: var(--dw-radius-pill);
  color: var(--dw-text-secondary);
  background: var(--dw-bg-muted);
}

.mode-pick.is-active .mode-pick__icon {
  background: color-mix(in srgb, var(--dw-text) 12%, var(--dw-bg-muted));
  color: var(--dw-text);
}

.mode-pick__body {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-1);
  min-width: 0;
  padding-right: var(--dw-space-7);
}

.mode-pick__title {
  font-size: var(--dw-text-md);
  font-weight: 600;
  color: var(--dw-text);
  line-height: var(--dw-leading-snug);
}

.mode-pick__desc {
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
  color: var(--dw-text-muted);
}

.mode-pick__check {
  position: absolute;
  top: clamp(8px, 1vmin, 10px);
  right: clamp(8px, 1vmin, 10px);
  font-size: var(--dw-text-xs);
  font-weight: 700;
  color: var(--dw-text);
}

.setting-callout {
  margin: var(--dw-space-6) 0 0;
  padding: var(--dw-pad-control-lg);
  border-radius: var(--dw-control-radius-sm);
  border: 1px solid var(--dw-border-light);
  background: var(--dw-bg-muted);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading-relaxed);
  color: var(--dw-text-secondary);
}

.setting-callout--muted {
  border-color: var(--dw-border-light);
  background: var(--dw-bg-muted);
  color: var(--dw-text-muted);
}

.step-toggle-group {
  margin-top: clamp(12px, 1.4vmin, 14px);
  padding-top: clamp(12px, 1.4vmin, 14px);
  border-top: 1px solid var(--dw-border-light);
}

.step-toggle-group__label {
  display: block;
  margin-bottom: clamp(6px, 0.8vmin, 8px);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.step-toggle-list {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap);
}

.route-list {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap);
}

.route-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(140px, 200px);
  gap: var(--dw-gap-md);
  align-items: center;
  padding: var(--dw-pad-control-lg);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-panel);
}

.route-row__meta {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-1);
  min-width: 0;
}

.route-row__badge {
  display: inline-flex;
  align-self: flex-start;
  padding: 1px var(--dw-space-3);
  border-radius: var(--dw-radius-pill);
  background: var(--dw-bg-muted);
  border: 1px solid var(--dw-border-light);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  line-height: var(--dw-leading-relaxed);
}

.route-row__hint {
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
  color: var(--dw-text-muted);
}

.route-row__select :deep(.dw-select) {
  width: 100%;
  min-width: 0;
}

.runtime-loading {
  display: flex;
  align-items: center;
  gap: var(--dw-gap);
  margin: 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.runtime-loading__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dw-text-secondary);
  animation: runtime-pulse 1.2s ease-in-out infinite;
}

@keyframes runtime-pulse {
  0%, 100% { opacity: 0.35; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1); }
}

.runtime-spec-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--dw-gap);
}

.runtime-spec {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-sm);
  padding: var(--dw-pad-control-lg);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg-panel);
}

.runtime-spec__label {
  font-size: var(--dw-text-xs);
  font-weight: 500;
  color: var(--dw-text-muted);
  line-height: var(--dw-leading-snug);
}

.runtime-spec__value {
  font-size: var(--dw-text-md);
  font-weight: 600;
  color: var(--dw-text);
  line-height: var(--dw-leading-snug);
  word-break: break-all;
}

.runtime-spec__value.is-mono {
  font-family: var(--dw-mono);
  font-size: var(--dw-text-sm);
  font-weight: 500;
}

.setting-card--runtime .setting-card__head {
  margin-bottom: clamp(10px, 1.2vmin, 12px);
}

.assistant-history-limit {
  margin-top: var(--dw-space-5);
}

.input-with-unit {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-sm);
  max-width: 220px;
}

.input-with-unit :deep(.dw-input) {
  flex: 1;
  min-width: 0;
}

.unit-chip {
  flex-shrink: 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
}

.field-hint {
  margin: var(--dw-space-2) 0 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
}

@media (max-width: 720px) {
  .mode-pick-grid {
    grid-template-columns: 1fr;
  }

  .route-row {
    grid-template-columns: 1fr;
  }

  .runtime-spec-grid {
    grid-template-columns: 1fr;
  }
}
</style>
