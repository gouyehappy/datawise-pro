<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, FormField, ModalActions, SettingsSwitch, DwInput} from '@/core/components'
import {
    DEFAULT_BOOKMARK_FOLDER,
    formatBookmarkTags,
    parseBookmarkTags,
} from '@/features/workspace/services/query-bookmark.service'
import {useTeamStore} from '@/features/team/stores/team-store'

const props = defineProps<{
    open: boolean
    defaultName?: string
    defaultConnectionName?: string
    defaultSql?: string
    defaultFolder?: string
    defaultTags?: string[]
    defaultQueryId?: string
    saving?: boolean
}>()

const emit = defineEmits<{
    'update:open': [value: boolean]
    save: [payload: {
        name: string
        connectionName: string
        sql: string
        folder: string
        tags: string[]
        saveToQueryLibrary: boolean
        changeNote: string
        queryId: string
    }]
}>()

const {t} = useI18n()
const teamStore = useTeamStore()

const name = ref('')
const connectionName = ref('')
const folder = ref(DEFAULT_BOOKMARK_FOLDER)
const tagsText = ref('')
const saveToQueryLibrary = ref(false)
const changeNote = ref('')

const canSaveToLibrary = computed(() => Boolean(teamStore.activeTeamId))
const canSave = computed(() => name.value.trim().length > 0 && (props.defaultSql?.trim().length ?? 0) > 0)

watch(
    () => props.open,
    (open) => {
        if (!open) return
        name.value = props.defaultName?.trim() || ''
        connectionName.value = props.defaultConnectionName?.trim() || ''
        folder.value = props.defaultFolder?.trim() || DEFAULT_BOOKMARK_FOLDER
        tagsText.value = formatBookmarkTags(props.defaultTags ?? [])
        saveToQueryLibrary.value = false
        changeNote.value = ''
    },
    {immediate: true},
)

function close() {
    emit('update:open', false)
}

function submit() {
    if (!canSave.value || !props.defaultSql?.trim()) return
    const queryId = props.defaultQueryId?.trim() || `bookmark-${name.value.trim().toLowerCase().replace(/\s+/g, '-')}`
    emit('save', {
        name: name.value.trim(),
        connectionName: connectionName.value.trim(),
        sql: props.defaultSql,
        folder: folder.value.trim() || DEFAULT_BOOKMARK_FOLDER,
        tags: parseBookmarkTags(tagsText.value),
        saveToQueryLibrary: saveToQueryLibrary.value && canSaveToLibrary.value,
        changeNote: changeNote.value.trim(),
        queryId,
    })
}
</script>

<template>
  <AppModal
      :open="open"
      :title="t('shortcut.bookmarks.saveTitle')"
      width="440px"
      @close="close"
  >
    <form class="modal-form" @submit.prevent="submit">
      <FormField :label="t('shortcut.bookmarks.fields.name')" input-id="bookmark-save-name">
        <template #default="{ id }">
          <DwInput :id="id" v-model="name" type="text" required />
        </template>
      </FormField>

      <FormField :label="t('shortcut.bookmarks.fields.connection')" input-id="bookmark-save-connection">
        <template #default="{ id }">
          <DwInput
              :id="id"
              v-model="connectionName"
              type="text"
              :placeholder="t('shortcut.bookmarks.fields.connectionPlaceholder')"
          />
        </template>
      </FormField>

      <FormField :label="t('shortcut.bookmarks.fields.folder')" input-id="bookmark-save-folder">
        <template #default="{ id }">
          <DwInput :id="id" v-model="folder" type="text" />
        </template>
      </FormField>

      <FormField :label="t('shortcut.bookmarks.fields.tags')" input-id="bookmark-save-tags">
        <template #default="{ id }">
          <DwInput
              :id="id"
              v-model="tagsText"
              type="text"
              :placeholder="t('shortcut.bookmarks.fields.tagsPlaceholder')"
          />
        </template>
      </FormField>

      <div v-if="canSaveToLibrary" class="bookmark-library-row">
        <SettingsSwitch v-model="saveToQueryLibrary" :label="t('platform.queryLibrary.saveWithBookmark')"/>
        <FormField
            v-if="saveToQueryLibrary"
            :label="t('platform.queryLibrary.changeNote')"
            input-id="bookmark-save-change-note"
        >
          <template #default="{ id }">
            <DwInput :id="id" v-model="changeNote" type="text"/>
          </template>
        </FormField>
      </div>
    </form>

    <template #footer>
      <ModalActions
          :confirm-disabled="!canSave || saving"
          :confirm-loading="saving"
          @cancel="close"
          @confirm="submit"
      />
    </template>
  </AppModal>
</template>

<style scoped>
.bookmark-library-row {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap);
  padding-top: var(--dw-space-2);
  border-top: 1px dashed var(--dw-border-light);
}
</style>
