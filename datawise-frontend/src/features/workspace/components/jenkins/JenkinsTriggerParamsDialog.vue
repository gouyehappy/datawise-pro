<script setup lang="ts">
import {computed, reactive, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, DwButton, DwSelect, DwInput, DwSecretInput, FormField, ModalActions} from '@/core/components'
import type {SelectOption} from '@/core/components/select.types'
import type {JenkinsJobParameter} from '@/features/explorer/services/jenkins-jobs.service'
import {jenkinsParameterInputKind} from '@/features/explorer/services/jenkins-jobs.service'

const props = defineProps<{
  open: boolean
  jobName: string
  parameters: JenkinsJobParameter[]
  loading?: boolean
}>()

const emit = defineEmits<{
  close: []
  confirm: [values: Record<string, string>]
}>()

const {t} = useI18n()
const values = reactive<Record<string, string>>({})

const title = computed(() => t('explorer.jenkinsJobs.triggerWithParams', {name: props.jobName}))

const booleanOptions: SelectOption[] = [
  {value: 'true', label: 'true'},
  {value: 'false', label: 'false'},
]

function choiceOptions(choices: string[] | undefined): SelectOption[] {
  return (choices ?? []).map((choice) => ({value: choice, label: choice}))
}

watch(
    () => [props.open, props.parameters] as const,
    ([open]) => {
      if (!open) return
      for (const key of Object.keys(values)) delete values[key]
      for (const param of props.parameters) {
        const name = param.name?.trim()
        if (!name) continue
        const kind = jenkinsParameterInputKind(param.type)
        if (kind === 'boolean') {
          values[name] = param.defaultValue === 'true' || param.defaultValue === 'True' ? 'true' : 'false'
        } else if (kind === 'choice') {
          values[name] = param.defaultValue
              || param.choices?.[0]
              || ''
        } else {
          values[name] = param.defaultValue ?? ''
        }
      }
    },
    {immediate: true, deep: true},
)

function close() {
  emit('close')
}

function confirm() {
  const payload: Record<string, string> = {}
  for (const [key, value] of Object.entries(values)) {
    payload[key] = value ?? ''
  }
  emit('confirm', payload)
}
</script>

<template>
  <AppModal
      :open="open"
      :title="title"
      :subtitle="t('explorer.jenkinsJobs.triggerWithParamsHint')"
      width="min(560px, 94vw)"
      max-height="min(84vh, 720px)"
      close-on-backdrop
      @close="close"
  >
    <div class="jenkins-params">
      <FormField
          v-for="param in parameters"
          :key="param.name || Math.random()"
          class="jenkins-params__field"
          :label="param.type ? `${param.name} (${param.type})` : (param.name || '')"
          :hint="param.description || undefined"
      >
        <template #default="{ id }">
          <DwSelect
              v-if="jenkinsParameterInputKind(param.type) === 'choice'"
              :id="id"
              v-model="values[param.name || '']"
              size="sm"
              :options="choiceOptions(param.choices)"
              :clearable="false"
          />

          <DwSelect
              v-else-if="jenkinsParameterInputKind(param.type) === 'boolean'"
              :id="id"
              v-model="values[param.name || '']"
              size="sm"
              :options="booleanOptions"
              :searchable="false"
              :clearable="false"
          />

          <DwInput
              v-else-if="jenkinsParameterInputKind(param.type) === 'text'"
              :id="id"
              v-model="values[param.name || '']"
              variant="sm"
              class="jenkins-params__textarea"
              :rows="4"
          />

          <DwSecretInput
              v-else-if="jenkinsParameterInputKind(param.type) === 'password'"
              :id="id"
              v-model="values[param.name || '']"
              variant="sm"
          />

          <DwInput
              v-else
              :id="id"
              v-model="values[param.name || '']"
              variant="sm"
              type="text"
          />
        </template>
      </FormField>
    </div>

    <template #footer>
      <ModalActions
          :confirm-label="t('explorer.jenkinsJobs.triggerAction')"
          :confirm-loading="loading"
          @cancel="close"
          @confirm="confirm"
      />
    </template>
  </AppModal>
</template>

<style scoped>
.jenkins-params {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-md);
}

.jenkins-params__textarea,
:deep(.jenkins-params__textarea) {
  resize: vertical;
  min-height: 84px;
}
</style>
