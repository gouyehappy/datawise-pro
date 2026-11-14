<script setup lang="ts">
import {computed, reactive, ref, toRef, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, DwButton, DwInlineAlert, DwInput, EmptyState, FormField, ModalActions} from '@/core/components'
import DwSelect from '@/core/components/DwSelect.vue'
import MigrationWizardSteps from '@/features/workspace/components/migration/MigrationWizardSteps.vue'
import type {WorkspaceTab} from '@/core/types'
import {platformApi} from '@/api'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {extractConnectionsFromTree} from '@/features/explorer/utils/tree-targets'
import {useModalFeedback} from '@/core/composables/useModalFeedback'
import {
    presentFederatedJoinRisk,
    type FederatedJoinRiskPresentation,
} from '@/features/platform/services/federated-join-risk.service'
import type {FederatedJoinRiskHints} from '@/features/platform/types/platform.types'
import {
    buildInitialFederatedWizardSources,
    canAccessFederatedWizardStep,
    createDefaultFederatedWizardForm,
    createFederatedWizardSourceDraft,
    formatFederatedSourceLabel,
    isFederatedWizardStepComplete,
    reorderFederatedWizardSources,
    suggestFederatedAlias,
    toFederatedViewSources,
    validateFederatedWizardStep,
    type FederatedViewWizardForm,
    type FederatedViewWizardSourceDraft,
    type FederatedViewWizardStep,
} from '@/features/platform/services/federated-view-wizard.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

const props = defineProps<{
    open: boolean
    tab: WorkspaceTab
}>()

const emit = defineEmits<{
    'update:open': [value: boolean]
    saved: []
}>()

const {t} = useI18n()
const explorer = useExplorerStore()
const {feedback, showSuccess, clearFeedback} = useModalFeedback(toRef(props, 'open'))

const wizardStep = ref<FederatedViewWizardStep>('sources')
const saving = ref(false)
const generating = ref(false)
const error = ref('')
const dragIndex = ref<number | null>(null)
const riskHints = ref<FederatedJoinRiskHints | null>(null)
let riskAnalyzeTimer: ReturnType<typeof setTimeout> | null = null
let riskAnalyzeSeq = 0

const riskPresentation = computed<FederatedJoinRiskPresentation | null>(() =>
    presentFederatedJoinRisk(riskHints.value, {
        equalityJoin: t('platform.federated.risk.equalityJoin'),
        nonEqualityJoin: t('platform.federated.risk.nonEqualityJoin'),
    }),
)

const riskMessage = computed(() => {
    const presented = riskPresentation.value
    if (!presented) return ''
    return t(`platform.federated.risk.${presented.summaryKey}`, presented.params)
})

const form = reactive<FederatedViewWizardForm>(createDefaultFederatedWizardForm())

const picker = reactive({
    connectionId: '',
    database: '',
    alias: '',
})

const wizardSteps = computed(() => [
    {id: 'sources', label: t('platform.federated.wizard.steps.sources'), number: 1},
    {id: 'generate', label: t('platform.federated.wizard.steps.generate'), number: 2},
    {id: 'save', label: t('platform.federated.wizard.steps.save'), number: 3},
])

const connections = computed(() => extractConnectionsFromTree(explorer.tree))

const connectionOptions = computed(() =>
    connections.value.map((conn) => ({value: conn.id, label: conn.label})),
)

const pickerDatabases = computed(
    () => connections.value.find((item) => item.id === picker.connectionId)?.databases ?? [],
)

const databaseOptions = computed(() =>
    pickerDatabases.value.map((db) => ({value: db.label, label: db.label})),
)

const existingAliases = computed(() => form.sources.map((item) => item.alias.trim()).filter(Boolean))

const canAddSource = computed(
    () => Boolean(picker.connectionId.trim() && picker.database.trim()),
)

const footerHint = computed(() => {
    const code = validateFederatedWizardStep(wizardStep.value, form)
    if (!code) {
        return wizardStep.value === 'save'
            ? t('platform.federated.wizard.hint.saveReady')
            : ''
    }
    return t(`platform.federated.wizard.errors.${code}`)
})

const canGoNext = computed(() => {
    if (wizardStep.value === 'sources') {
        return validateFederatedWizardStep('sources', form) === null
    }
    if (wizardStep.value === 'generate') {
        return validateFederatedWizardStep('generate', form) === null
    }
    return false
})

const canSave = computed(() => validateFederatedWizardStep('save', form) === null && !saving.value)

watch(
    () => props.open,
    (isOpen) => {
        if (!isOpen) return
        Object.assign(form, createDefaultFederatedWizardForm({
            sources: buildInitialFederatedWizardSources(
                extractConnectionsFromTree(explorer.tree),
                props.tab.connectionId,
                props.tab.database,
            ),
        }))
        wizardStep.value = 'sources'
        error.value = ''
        picker.connectionId = props.tab.connectionId ?? ''
        picker.database = props.tab.database ?? ''
        picker.alias = ''
        dragIndex.value = null
    },
)

watch(
    () => picker.connectionId,
    (connectionId) => {
        const databases = connections.value.find((item) => item.id === connectionId)?.databases ?? []
        if (!databases.some((db) => db.label === picker.database)) {
            picker.database = databases[0]?.label ?? ''
        }
        if (!picker.alias.trim() && picker.database) {
            picker.alias = suggestFederatedAlias(picker.database, existingAliases.value)
        }
    },
)

watch(
    () => picker.database,
    (database) => {
        if (!picker.alias.trim() && database) {
            picker.alias = suggestFederatedAlias(database, existingAliases.value)
        }
    },
)

function close() {
    emit('update:open', false)
}

function isStepAccessible(step: string) {
    return canAccessFederatedWizardStep(step as FederatedViewWizardStep, form)
}

function isStepCompleted(step: string) {
    return isFederatedWizardStepComplete(step as FederatedViewWizardStep, form)
}

function goToStep(step: FederatedViewWizardStep) {
    if (!isStepAccessible(step) && wizardStep.value !== step) return
    wizardStep.value = step
    error.value = ''
}

function goNext() {
    const code = validateFederatedWizardStep(wizardStep.value, form)
    if (code) {
        error.value = t(`platform.federated.wizard.errors.${code}`)
        return
    }
    if (wizardStep.value === 'sources') {
        wizardStep.value = 'generate'
    } else if (wizardStep.value === 'generate') {
        wizardStep.value = 'save'
    }
    error.value = ''
}

function goBack() {
    if (wizardStep.value === 'generate') {
        wizardStep.value = 'sources'
    } else if (wizardStep.value === 'save') {
        wizardStep.value = 'generate'
    }
    error.value = ''
}

function addSource() {
    if (!canAddSource.value) return
    const connection = connections.value.find((item) => item.id === picker.connectionId)
    if (!connection) return
    const alias = picker.alias.trim() || suggestFederatedAlias(picker.database, existingAliases.value)
    form.sources.push(createFederatedWizardSourceDraft({
        connectionId: picker.connectionId,
        connectionLabel: connection.label,
        database: picker.database,
        alias,
        existingAliases: existingAliases.value,
    }))
    picker.alias = ''
}

function removeSource(id: string) {
    form.sources = form.sources.filter((item) => item.id !== id)
}

function onDragStart(index: number, event: DragEvent) {
    dragIndex.value = index
    event.dataTransfer?.setData('text/plain', String(index))
    event.dataTransfer!.effectAllowed = 'move'
}

function onDrop(index: number) {
    if (dragIndex.value == null) return
    form.sources = reorderFederatedWizardSources(form.sources, dragIndex.value, index)
    dragIndex.value = null
}

function onDragEnd() {
    dragIndex.value = null
}

async function refreshRiskHints(sql: string) {
    const trimmed = sql.trim()
    if (!trimmed) {
        riskHints.value = null
        return
    }
    const seq = ++riskAnalyzeSeq
    try {
        const hints = await platformApi.analyzeFederatedJoinRisk({sql: trimmed})
        if (seq === riskAnalyzeSeq) {
            riskHints.value = hints
        }
    } catch {
        if (seq === riskAnalyzeSeq) {
            riskHints.value = null
        }
    }
}

function scheduleRiskAnalyze(sql: string) {
    if (riskAnalyzeTimer) clearTimeout(riskAnalyzeTimer)
    riskAnalyzeTimer = setTimeout(() => {
        riskAnalyzeTimer = null
        void refreshRiskHints(sql)
    }, 400)
}

watch(
    () => form.sql,
    (sql) => {
        scheduleRiskAnalyze(sql)
    },
)

async function generateSql() {
    if (!form.prompt.trim() || generating.value) return
    const sources = toFederatedViewSources(form.sources)
    if (sources.length < 2) {
        error.value = t('platform.federated.wizard.errors.needTwoSources')
        return
    }
    generating.value = true
    error.value = ''
    clearFeedback()
    try {
        const result = await platformApi.generateFederatedSql({
            prompt: form.prompt.trim(),
            sources,
        })
        form.sql = result.sql
        await refreshRiskHints(result.sql)
        showSuccess(t('platform.federated.generateDone'))
    } catch (err) {
        error.value = resolveCaughtApiErrorMessage(err, t, 'platform.common.runFailed')
    } finally {
        generating.value = false
    }
}

async function save() {
    const saveCode = validateFederatedWizardStep('save', form)
    if (saveCode) {
        error.value = t(`platform.federated.wizard.errors.${saveCode}`)
        return
    }
    const sqlCode = validateFederatedWizardStep('generate', form)
    if (sqlCode) {
        error.value = t(`platform.federated.wizard.errors.${sqlCode}`)
        return
    }
    saving.value = true
    error.value = ''
    try {
        await platformApi.saveFederatedView({
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            sql: form.sql.trim(),
            sources: toFederatedViewSources(form.sources),
        })
        emit('saved')
        close()
    } catch (err) {
        error.value = resolveCaughtApiErrorMessage(err, t, 'platform.common.runFailed')
    } finally {
        saving.value = false
    }
}
</script>

<template>
  <AppModal
      :open="open"
      :title="t('platform.federated.wizard.title')"
      :subtitle="t('platform.federated.wizard.subtitle')"
      width="720px"
      @close="close"
  >
    <MigrationWizardSteps
        :steps="wizardSteps"
        :active-step="wizardStep"
        :ariaLabel="t('platform.federated.wizard.flowTitle')"
        :is-step-accessible="isStepAccessible"
        :is-step-completed="isStepCompleted"
        @step-click="goToStep($event as FederatedViewWizardStep)"
    />

    <section v-if="wizardStep === 'sources'" class="federated-wizard__panel">
      <p class="federated-wizard__hint">{{ t('platform.federated.wizard.sourcesHint') }}</p>
      <p class="federated-wizard__hint federated-wizard__hint--bounds">{{ t('platform.federated.boundsHint') }}</p>

      <div class="federated-wizard__picker">
        <label class="federated-wizard__field">
          <span>{{ t('platform.federated.wizard.connection') }}</span>
          <DwSelect
              v-model="picker.connectionId"
              size="sm"
              :options="connectionOptions"
              :placeholder="t('platform.federated.wizard.pickConnection')"
          />
        </label>
        <label class="federated-wizard__field">
          <span>{{ t('platform.federated.wizard.database') }}</span>
          <DwSelect
              v-if="databaseOptions.length"
              v-model="picker.database"
              size="sm"
              :options="databaseOptions"
              :placeholder="t('platform.federated.wizard.pickDatabase')"
              :disabled="!picker.connectionId"
          />
          <DwInput
              v-else
              v-model="picker.database"
              type="text"
              :disabled="!picker.connectionId"
          />
        </label>
        <label class="federated-wizard__field">
          <span>{{ t('platform.federated.wizard.alias') }}</span>
          <DwInput v-model="picker.alias" type="text" :spellcheck="false"/>
        </label>
        <DwButton type="button" variant="secondary" :disabled="!canAddSource" @click="addSource">
          {{ t('platform.federated.wizard.addSource') }}
        </DwButton>
      </div>

      <ul v-if="form.sources.length" class="federated-wizard__source-list">
        <li
            v-for="(source, index) in form.sources"
            :key="source.id"
            class="federated-wizard__source-item"
            :class="{'is-dragging': dragIndex === index}"
            draggable="true"
            @dragstart="onDragStart(index, $event)"
            @dragover.prevent
            @drop="onDrop(index)"
            @dragend="onDragEnd"
        >
          <button
              type="button"
              class="federated-wizard__drag-handle"
              :aria-label="t('platform.federated.wizard.dragHandle')"
              @mousedown.stop
          >
            ⋮⋮
          </button>
          <div class="federated-wizard__source-main">
            <strong>{{ formatFederatedSourceLabel(source) }}</strong>
            <label class="federated-wizard__alias-edit">
              <span>{{ t('platform.federated.wizard.alias') }}</span>
              <DwInput v-model="source.alias" type="text" :spellcheck="false"/>
            </label>
          </div>
          <DwButton
              type="button"
              variant="ghost"
              @click="removeSource(source.id)"
          >
            {{ t('platform.common.delete') }}
          </DwButton>
        </li>
      </ul>
      <EmptyState
          v-else
          embedded
          compact
          :title="t('platform.federated.wizard.noSources')"
      />
    </section>

    <section v-else-if="wizardStep === 'generate'" class="federated-wizard__panel">
      <p class="federated-wizard__hint">{{ t('platform.federated.wizard.generateHint') }}</p>
      <FormField :label="t('platform.federated.generatePrompt')">
        <template #default="{ id }">
          <DwInput
              :id="id"
              v-model="form.prompt"
              :rows="3"
              :placeholder="t('platform.federated.generatePromptPlaceholder')"
          />
        </template>
      </FormField>
      <div class="federated-wizard__actions-row">
        <DwButton
            type="button"
            variant="secondary"
            :disabled="generating || !form.prompt.trim()"
            @click="generateSql"
        >
          {{ generating ? t('platform.common.loading') : t('platform.federated.generateSql') }}
        </DwButton>
      </div>
      <FormField :label="t('platform.common.sql')">
        <template #default="{ id }">
          <DwInput
              :id="id"
              v-model="form.sql"
              variant="mono"
              :rows="10"
              :spellcheck="false"
          />
        </template>
      </FormField>
      <DwInlineAlert
          v-if="riskMessage"
          density="banner"
          :variant="riskPresentation?.tone ?? 'info'"
          :message="riskMessage"
      />
    </section>

    <section v-else class="federated-wizard__panel">
      <FormField :label="t('platform.common.name')">
        <template #default="{ id }">
          <DwInput :id="id" v-model="form.name" type="text"/>
        </template>
      </FormField>
      <FormField :label="t('platform.common.description')">
        <template #default="{ id }">
          <DwInput :id="id" v-model="form.description" :rows="2"/>
        </template>
      </FormField>
      <div class="federated-wizard__review">
        <h4>{{ t('platform.federated.wizard.reviewSources') }}</h4>
        <ul>
          <li v-for="source in form.sources" :key="source.id">
            {{ formatFederatedSourceLabel(source) }}
          </li>
        </ul>
        <h4>{{ t('platform.common.sql') }}</h4>
        <pre class="federated-wizard__sql-preview">{{ form.sql }}</pre>
      </div>
      <DwInlineAlert
          v-if="riskMessage"
          density="banner"
          :variant="riskPresentation?.tone ?? 'info'"
          :message="riskMessage"
      />
    </section>

    <DwInlineAlert v-if="error" :message="error"/>
    <DwInlineAlert
        v-else-if="feedback"
        density="banner"
        :variant="feedback.variant"
        :message="feedback.message"
    />
    <DwInlineAlert v-else-if="footerHint" variant="info" :message="footerHint"/>

    <template #footer>
      <div class="federated-wizard__footer">
        <DwButton
            v-if="wizardStep !== 'sources'"
            type="button"
            variant="ghost"
            @click="goBack"
        >
          {{ t('platform.federated.wizard.back') }}
        </DwButton>
        <div class="federated-wizard__footer-spacer"/>
        <DwButton type="button" variant="ghost" @click="close">
          {{ t('common.cancel') }}
        </DwButton>
        <DwButton
            v-if="wizardStep !== 'save'"
            type="button"
            variant="secondary"
            :disabled="!canGoNext"
            @click="goNext"
        >
          {{ t('platform.federated.wizard.next') }}
        </DwButton>
        <DwButton
            v-else
            type="button"
            variant="secondary"
            :disabled="!canSave"
            @click="save"
        >
          {{ saving ? t('platform.common.loading') : t('platform.common.save') }}
        </DwButton>
      </div>
    </template>
  </AppModal>
</template>

<style scoped>
.federated-wizard__panel {
  margin-top: var(--dw-space-8);
}

.federated-wizard__hint {
  margin: 0 0 var(--dw-space-6);
  font-size: var(--dw-text-md);
  color: var(--dw-text-muted);
}

.federated-wizard__picker {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
  gap: var(--dw-gap-md);
  align-items: end;
  margin-bottom: var(--dw-space-7);
}

.federated-wizard__field {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-sm);
  font-size: var(--dw-text-sm);
}

.federated-wizard__source-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap);
}

.federated-wizard__source-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--dw-gap-md);
  align-items: center;
  padding: var(--dw-pad-control-lg);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-subtle);
}

.federated-wizard__source-item.is-dragging {
  opacity: 0.55;
}

.federated-wizard__drag-handle {
  border: none;
  background: transparent;
  cursor: grab;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xl);
  line-height: 1;
  padding: var(--dw-space-2);
}

.federated-wizard__source-main {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap);
  min-width: 0;
}

.federated-wizard__source-main strong {
  font-size: var(--dw-text-md);
}

.federated-wizard__alias-edit {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--dw-gap);
  align-items: center;
  font-size: var(--dw-text-sm);
}

.federated-wizard__actions-row {
  display: flex;
  justify-content: flex-end;
  margin: var(--dw-space-4) 0 var(--dw-space-6);
}

.federated-wizard__review h4 {
  margin: var(--dw-space-6) 0 var(--dw-space-3);
  font-size: var(--dw-text-md);
}

.federated-wizard__review ul {
  margin: 0;
  padding-left: 18px;
  font-size: var(--dw-text-sm);
}

.federated-wizard__sql-preview {
  margin: 0;
  padding: var(--dw-space-5);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg-subtle);
  font-size: var(--dw-text-sm);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 180px;
  overflow: auto;
}

.federated-wizard__footer {
  display: flex;
  align-items: center;
  gap: var(--dw-gap);
  width: 100%;
}

.federated-wizard__footer-spacer {
  flex: 1;
}

.modal-textarea--mono {
  font-family: var(--dw-font-mono);
  font-size: var(--dw-text-sm);
}

@media (max-width: 760px) {
  .federated-wizard__picker {
    grid-template-columns: 1fr;
  }
}
</style>
