<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import type {ProductionApprovalTeamOption} from '@/features/team/services/production-approval-policy.service'
import {AppModal, DwSelect, DwInput, FormField, ModalActions, DwInlineAlert} from '@/core/components'
import type {SelectOption} from '@/core/components/select.types'

const props = defineProps<{
    open: boolean
    saving?: boolean
    error?: string
    sql: string
    connectionName?: string
    database?: string
    teams: ProductionApprovalTeamOption[]
}>()

const emit = defineEmits<{
    'update:open': [value: boolean]
    submit: [teamId: string]
}>()

const {t} = useI18n()
const selectedTeamId = ref('')

const teamOptions = computed<SelectOption[]>(() =>
    props.teams.map((team) => ({
      value: team.teamId,
      label: team.teamName,
    })),
)

const canSubmit = computed(() => selectedTeamId.value.trim().length > 0 && props.sql.trim().length > 0)

watch(
    () => props.open,
    (open) => {
        if (!open) return
        selectedTeamId.value = props.teams[0]?.teamId ?? ''
    },
    {immediate: true},
)

function close() {
    emit('update:open', false)
}

function submit() {
    if (!canSubmit.value) return
    emit('submit', selectedTeamId.value)
}
</script>

<template>
  <AppModal
      :open="open"
      :title="t('console.productionApproval.dialogTitle')"
      :subtitle="t('console.productionApproval.dialogHint')"
      width="560px"
      @close="close"
  >
    <form class="modal-form" @submit.prevent="submit">
      <FormField v-if="teams.length > 1" :label="t('console.productionApproval.teamField')">
        <template #default="{ id }">
          <DwSelect
              :id="id"
              v-model="selectedTeamId"
              :options="teamOptions"
              :clearable="false"
          />
        </template>
      </FormField>

      <FormField :label="t('console.productionApproval.connectionField')">
        <template #default="{ id }">
          <DwInput
              :id="id"
              type="text"
              readonly
              :model-value="[connectionName, database].filter(Boolean).join(' · ') || '—'"
          />
        </template>
      </FormField>

      <FormField :label="t('console.productionApproval.sqlField')">
        <template #default="{ id }">
          <DwInput
              :id="id"
              class="modal-textarea"
              readonly
              :rows="8"
              :model-value="sql"
              :spellcheck="false"
          />
        </template>
      </FormField>
      <DwInlineAlert density="banner" :message="error"/>
    </form>

    <template #footer>
      <ModalActions
          :confirm-label="saving ? t('console.productionApproval.submitting') : t('console.productionApproval.submitAction')"
          :confirm-disabled="!canSubmit || saving"
          @cancel="close"
          @confirm="submit"
      />
    </template>
  </AppModal>
</template>

