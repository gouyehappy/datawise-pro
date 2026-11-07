<script setup lang="ts">
import {computed, reactive, ref, toRef, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {platformApi} from '@/api'
import {AppModal, DwButton, DwInlineAlert, DwInput, FormField, ModalActions} from '@/core/components'
import type {AiCanvasParameter, RerunAnalysisCanvasResult} from '@/features/platform/types/platform.types'
import {buildParameterValueMap} from '@/features/platform/services/analysis-canvas-parameters.service'
import {useModalFeedback} from '@/core/composables/useModalFeedback'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

const props = defineProps<{
    open: boolean
    canvasId: string | null
}>()

const emit = defineEmits<{
    'update:open': [value: boolean]
    completed: [result: RerunAnalysisCanvasResult]
}>()

const {t} = useI18n()
const layout = useLayoutStore()
const workspace = useWorkspaceStore()
const {feedback, showSuccess, clearFeedback} = useModalFeedback(toRef(props, 'open'))

const loading = ref(false)
const running = ref(false)
const error = ref('')
const parameters = ref<AiCanvasParameter[]>([])
const canvasTitle = ref('')
const values = reactive<Record<string, string>>({})
const lastResult = ref<RerunAnalysisCanvasResult | null>(null)

const hasParameters = computed(() => parameters.value.length > 0)

watch(
    () => [props.open, props.canvasId] as const,
    async ([open, canvasId]) => {
        if (!open || !canvasId) return
        loading.value = true
        error.value = ''
        lastResult.value = null
        clearFeedback()
        try {
            const detail = await platformApi.getAnalysisCanvas(canvasId)
            canvasTitle.value = detail.title
            parameters.value = detail.parameters ?? []
            for (const key of Object.keys(values)) {
                delete values[key]
            }
            for (const param of parameters.value) {
                if (!param.key) continue
                values[param.key] = param.defaultValue ?? ''
            }
        } catch (err) {
            error.value = resolveCaughtApiErrorMessage(err, t, 'platform.common.runFailed')
        } finally {
            loading.value = false
        }
    },
    {immediate: true},
)

function close() {
    emit('update:open', false)
}

async function rerun() {
    if (!props.canvasId || running.value) return
    running.value = true
    error.value = ''
    clearFeedback()
    try {
        const result = await platformApi.rerunAnalysisCanvas({
            canvasId: props.canvasId,
            parameterValues: buildParameterValueMap(parameters.value, {...values}),
        })
        lastResult.value = result
        emit('completed', result)
        showSuccess(t('platform.canvas.rerunDone'))
    } catch (err) {
        error.value = resolveCaughtApiErrorMessage(err, t, 'platform.common.runFailed')
    } finally {
        running.value = false
    }
}

async function copySql() {
    const sql = lastResult.value?.sql?.trim()
    if (!sql) return
    try {
        await navigator.clipboard.writeText(sql)
        showSuccess(t('platform.canvas.copiedSql'))
    } catch {
        error.value = t('explorer.exportSqlFailed')
    }
}

function openInConsole() {
    const sql = lastResult.value?.sql?.trim()
    if (!sql) return
    layout.setModule('database')
    workspace.openConsole({sql})
    close()
}
</script>

<template>
  <AppModal
      :open="open"
      :title="t('platform.canvas.rerunTitle', {title: canvasTitle || '—'})"
      width="520px"
      @close="close"
  >
    <p v-if="loading" class="canvas-rerun__status">{{ t('platform.common.loading') }}</p>
    <DwInlineAlert v-else-if="error" :message="error"/>

    <template v-else>
      <DwInlineAlert
          v-if="feedback"
          density="banner"
          :variant="feedback.variant"
          :message="feedback.message"
      />
      <p v-if="!hasParameters" class="canvas-rerun__hint">{{ t('platform.canvas.rerunNoParams') }}</p>
      <form v-else class="canvas-rerun__form" @submit.prevent="rerun">
        <FormField
            v-for="param in parameters"
            :key="param.key"
            :label="param.label || param.key"
            :input-id="`canvas-param-${param.key}`"
        >
          <template #default="{ id }">
            <DwInput :id="id" v-model="values[param.key]" type="text"/>
          </template>
        </FormField>
      </form>

      <section v-if="lastResult" class="canvas-rerun__result">
        <h4>{{ t('platform.canvas.rerunResult') }}</h4>
        <pre v-if="lastResult.sql" class="canvas-rerun__sql">{{ lastResult.sql }}</pre>
        <p v-if="lastResult.prompt && !lastResult.sql" class="canvas-rerun__prompt">{{ lastResult.prompt }}</p>
        <div class="canvas-rerun__actions">
          <DwButton v-if="lastResult.sql" type="button" variant="ghost" @click="copySql">
            {{ t('platform.canvas.copySql') }}
          </DwButton>
          <DwButton v-if="lastResult.sql" type="button" variant="secondary" @click="openInConsole">
            {{ t('platform.canvas.openInConsole') }}
          </DwButton>
        </div>
      </section>
    </template>

    <template #footer>
      <ModalActions
          :confirm-label="t('platform.canvas.rerun')"
          :confirm-disabled="loading || running || Boolean(error)"
          :confirm-loading="running"
          @cancel="close"
          @confirm="rerun"
      />
    </template>
  </AppModal>
</template>

<style scoped>
.canvas-rerun__status,
.canvas-rerun__hint {
    margin: 0;
    font-size: var(--dw-text-md);
    color: var(--dw-text-muted);
}

.canvas-rerun__form {
    display: flex;
    flex-direction: column;
    gap: var(--dw-gap-md);
}

.canvas-rerun__result {
    margin-top: var(--dw-space-6);
    padding-top: var(--dw-space-6);
    border-top: 1px solid var(--dw-border-light);
}

.canvas-rerun__result h4 {
    margin: 0 0 var(--dw-space-4);
    font-size: var(--dw-text-md);
}

.canvas-rerun__sql {
    margin: 0;
    padding: var(--dw-space-4);
    border-radius: var(--dw-control-radius-sm);
    background: var(--dw-bg-subtle);
    font-size: var(--dw-text-sm);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 160px;
    overflow: auto;
}

.canvas-rerun__prompt {
    margin: 0;
    font-size: var(--dw-text-sm);
    color: var(--dw-text-muted);
}

.canvas-rerun__actions {
    display: flex;
    gap: var(--dw-gap);
    margin-top: var(--dw-space-4);
}
</style>
