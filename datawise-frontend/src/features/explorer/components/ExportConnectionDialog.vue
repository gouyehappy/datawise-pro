<script setup lang="ts">
import {computed, nextTick, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, EmptyState, FormField, ModalActions, DwInlineAlert, DwInput, DwCheckbox} from '@/core/components'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {
    collectSelectedConnectionIds,
    listExportConnectionGroups,
    type ExportConnectionGroupOption,
} from '@/features/explorer/services/export-connection-groups.service'

const MIN_PASSPHRASE_LENGTH = 4

const props = defineProps<{
    open: boolean
    projectName: string
    busy?: boolean
}>()

const emit = defineEmits<{
    'update:open': [value: boolean]
    confirm: [payload: {
        passphrase: string
        confirmPassphrase: string
        connectionIds: string[]
    }]
}>()

const {t} = useI18n()
const explorer = useExplorerStore()
const passphrase = ref('')
const confirmPassphrase = ref('')
const inputRef = ref<{ $el?: HTMLElement } | null>(null)
const groups = ref<ExportConnectionGroupOption[]>([])
const selectedGroupIds = ref<Set<string>>(new Set())

const passphraseTooShort = computed(
    () => passphrase.value.length > 0 && passphrase.value.length < MIN_PASSPHRASE_LENGTH,
)
const passphraseMismatch = computed(
    () => passphrase.value.length > 0
        && confirmPassphrase.value.length > 0
        && passphrase.value !== confirmPassphrase.value,
)
const selectedConnectionIds = computed(() =>
    collectSelectedConnectionIds(groups.value, selectedGroupIds.value),
)
const allGroupsSelected = computed(
    () => groups.value.length > 0
        && groups.value.every((group) => selectedGroupIds.value.has(group.id)),
)
const someGroupsSelected = computed(
    () => groups.value.some((group) => selectedGroupIds.value.has(group.id)),
)
const canSubmit = computed(
    () => !props.busy
        && passphrase.value.length >= MIN_PASSPHRASE_LENGTH
        && passphrase.value === confirmPassphrase.value
        && selectedConnectionIds.value.length > 0,
)

watch(
    () => props.open,
    async (isOpen) => {
        if (!isOpen) return
        passphrase.value = ''
        confirmPassphrase.value = ''
        groups.value = listExportConnectionGroups(explorer.tree)
        selectedGroupIds.value = new Set(groups.value.map((group) => group.id))
        await nextTick()
        const el = inputRef.value?.$el
        if (el instanceof HTMLInputElement) el.focus()
    },
)

function isGroupSelected(groupId: string): boolean {
    return selectedGroupIds.value.has(groupId)
}

function toggleGroup(groupId: string, checked: boolean) {
    const next = new Set(selectedGroupIds.value)
    if (checked) next.add(groupId)
    else next.delete(groupId)
    selectedGroupIds.value = next
}

function toggleAllGroups(checked: boolean) {
    selectedGroupIds.value = checked
        ? new Set(groups.value.map((group) => group.id))
        : new Set()
}

function close() {
    if (props.busy) return
    emit('update:open', false)
}

function submit() {
    if (!canSubmit.value) return
    emit('confirm', {
        passphrase: passphrase.value,
        confirmPassphrase: confirmPassphrase.value,
        connectionIds: selectedConnectionIds.value,
    })
}
</script>

<template>
  <AppModal
      :open="open"
      :title="t('explorer.exportConnectionTitle')"
      :subtitle="t('explorer.exportConnectionSubtitle', {name: projectName})"
      width="480px"
      @close="close"
  >
    <form class="modal-form" @submit.prevent="submit" @keydown.enter.prevent="submit">
      <DwInlineAlert
          density="banner"
          variant="info"
          :message="t('explorer.exportConnectionHint')"
      />

      <div class="group-picker">
        <div class="group-picker__header">
          <span class="group-picker__title">{{ t('explorer.exportConnectionSelectGroups') }}</span>
          <DwCheckbox
              v-if="groups.length"
              :model-value="allGroupsSelected"
              :indeterminate="someGroupsSelected && !allGroupsSelected"
              :disabled="busy"
              :label="t('explorer.exportConnectionSelectAll')"
              @update:model-value="toggleAllGroups"
          />
        </div>
        <EmptyState
            v-if="!groups.length"
            embedded
            compact
            :title="t('explorer.exportConnectionNoGroups')"
        />
        <div v-else class="group-picker__list">
          <DwCheckbox
              v-for="group in groups"
              :key="group.id"
              class="group-picker__item"
              :model-value="isGroupSelected(group.id)"
              :disabled="busy"
              @update:model-value="(checked) => toggleGroup(group.id, checked)"
          >
            <span class="group-picker__name">{{ group.label }}</span>
            <span class="group-picker__count">
              {{ t('explorer.exportConnectionGroupCount', {count: group.connectionIds.length}) }}
            </span>
          </DwCheckbox>
        </div>
      </div>

      <FormField :label="t('settings.configPortability.passphrase')">
        <template #default="{ id }">
          <DwInput
              :id="id"
              ref="inputRef"
              v-model="passphrase"
              type="password"
              autocomplete="new-password"
              :disabled="busy"
              :placeholder="t('settings.configPortability.passphraseHint')"
          />
        </template>
      </FormField>
      <FormField :label="t('settings.configPortability.confirmPassphrase')">
        <template #default="{ id }">
          <DwInput
              :id="id"
              v-model="confirmPassphrase"
              type="password"
              autocomplete="new-password"
              :disabled="busy"
          />
        </template>
      </FormField>
      <DwInlineAlert
          v-if="passphraseTooShort"
          density="banner"
          variant="warning"
          :message="t('settings.configPortability.passphraseTooShort')"
      />
      <DwInlineAlert
          v-else-if="passphraseMismatch"
          density="banner"
          variant="warning"
          :message="t('settings.configPortability.passphraseMismatch')"
      />
    </form>

    <template #footer>
      <ModalActions
          :confirm-label="t('explorer.exportConnectionAction')"
          :confirm-disabled="!canSubmit"
          :confirm-loading="busy"
          @cancel="close"
          @confirm="submit"
      />
    </template>
  </AppModal>
</template>

<style scoped>
.modal-form {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap);
}

.group-picker {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-2);
  min-width: 0;
}

.group-picker__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap);
}

.group-picker__title {
  font-size: var(--dw-font-size-sm);
  font-weight: 600;
  color: var(--dw-text);
}

.group-picker__list {
  max-height: 220px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--dw-space-2);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-radius);
  background: var(--dw-bg-elevated, var(--dw-bg));
}

.group-picker__item {
  width: 100%;
  padding: 4px 6px;
  border-radius: var(--dw-radius-sm, 4px);
}

.group-picker__item :deep(.dw-checkbox__label) {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  gap: var(--dw-gap);
}

.group-picker__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-picker__count {
  margin-left: auto;
  color: var(--dw-text-muted);
  font-size: var(--dw-font-size-xs, 12px);
  flex-shrink: 0;
}
</style>
