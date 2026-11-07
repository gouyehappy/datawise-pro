<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import type {ShareTeamSharedQueryPayload, TeamSharedQuerySummary} from '@/core/types'
import {AppModal, FormField, ModalActions, DwInlineAlert, DwInput} from '@/core/components'
import {formatBookmarkTags, parseBookmarkTags} from '@/features/workspace/services/query-bookmark.service'

const props = defineProps<{
    open: boolean
    saving?: boolean
    error?: string
    editing?: TeamSharedQuerySummary | null
    defaultTitle?: string
    defaultDescription?: string
    defaultConnectionName?: string
    defaultDatabase?: string
    defaultSql?: string
    defaultTags?: string[]
}>()

const emit = defineEmits<{
    'update:open': [value: boolean]
    save: [payload: ShareTeamSharedQueryPayload]
}>()

const {t} = useI18n()

const title = ref('')
const description = ref('')
const connectionName = ref('')
const database = ref('')
const tagsText = ref('')
const sql = ref('')

const isEdit = computed(() => !!props.editing)

const canSave = computed(() => title.value.trim().length > 0 && sql.value.trim().length > 0)

watch(
    () => props.open,
    (open) => {
        if (!open) return
        title.value = props.editing?.title ?? props.defaultTitle?.trim() ?? ''
        description.value = props.editing?.description ?? props.defaultDescription?.trim() ?? ''
        connectionName.value = props.editing?.connectionName ?? props.defaultConnectionName?.trim() ?? ''
        database.value = props.editing?.database ?? props.defaultDatabase?.trim() ?? ''
        tagsText.value = formatBookmarkTags(props.editing?.tags ?? props.defaultTags ?? [])
        sql.value = props.defaultSql?.trim() ?? ''
    },
    {immediate: true},
)

function close() {
    emit('update:open', false)
}

function submit() {
    if (!canSave.value) return
    emit('save', {
        title: title.value.trim(),
        description: description.value.trim() || undefined,
        connectionName: connectionName.value.trim() || undefined,
        database: database.value.trim() || undefined,
        sql: sql.value,
        tags: parseBookmarkTags(tagsText.value),
    })
}
</script>

<template>
  <AppModal
      :open="open"
      :title="isEdit ? t('team.sharedQueries.editTitle') : t('team.sharedQueries.addTitle')"
      :subtitle="t('team.sharedQueries.dialogHint')"
      width="520px"
      @close="close"
  >
    <form class="modal-form" @submit.prevent="submit">
      <FormField :label="t('team.sharedQueries.fields.title')">
        <template #default="{ id }">
          <DwInput :id="id" v-model="title" type="text" />
        </template>
      </FormField>

      <FormField :label="t('team.sharedQueries.fields.description')">
        <template #default="{ id }">
          <DwInput :id="id" v-model="description" class="modal-textarea" :rows="2" />
        </template>
      </FormField>

      <FormField :label="t('team.sharedQueries.fields.connection')">
        <template #default="{ id }">
          <DwInput :id="id" v-model="connectionName" type="text" />
        </template>
      </FormField>

      <FormField :label="t('team.sharedQueries.fields.database')">
        <template #default="{ id }">
          <DwInput :id="id" v-model="database" type="text" />
        </template>
      </FormField>

      <FormField :label="t('team.sharedQueries.fields.tags')">
        <template #default="{ id }">
          <DwInput :id="id" v-model="tagsText" type="text" />
        </template>
      </FormField>

      <FormField :label="t('team.sharedQueries.fields.sql')">
        <template #default="{ id }">
          <DwInput :id="id" v-model="sql" class="modal-textarea" :rows="8" :spellcheck="false" />
        </template>
      </FormField>
      <DwInlineAlert :message="error"/>
    </form>

    <template #footer>
      <ModalActions
          :cancel-label="t('common.cancel')"
          :confirm-label="saving ? t('common.saving') : t('common.save')"
          :confirm-disabled="!canSave || saving"
          @cancel="close"
          @confirm="submit"
      />
    </template>
  </AppModal>
</template>
