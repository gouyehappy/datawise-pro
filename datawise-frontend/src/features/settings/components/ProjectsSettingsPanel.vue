<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {ConfirmDialog, DwButton, DwInput, DwSelect, DwSplitPane, EmptyState, FormField} from '@/core/components'
import type {SelectOption} from '@/core/components/select.types'
import {DwIcon} from '@/core/icons'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import SettingsTipsCard from '@/features/settings/components/SettingsTipsCard.vue'
import CreateProjectDialog from '@/features/project/components/CreateProjectDialog.vue'
import {useConfirmDialog} from '@/core/composables/useConfirmDialog'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {useProjectStore} from '@/features/project/stores/project'
import type {ProjectDto, ProjectTemplateId} from '@/features/project/services/project-api'
import {projectsApi} from '@/features/project/services/project-api'
import {resolveDisplayApiErrorMessage} from '@/shared/api/http/api-error-message'
import {ApiError} from '@/shared/api/http/api-error'

const {t} = useI18n()
const toast = useAppToast()
const projectStore = useProjectStore()
const {
  open: confirmOpen,
  title: confirmTitle,
  message: confirmMessage,
  confirmLabel,
  confirmVariant,
  ask: askConfirm,
  onConfirm: onConfirmDialog,
  onOpenUpdate: onConfirmOpenUpdate,
} = useConfirmDialog('danger')

const loading = ref(false)
const saving = ref(false)
const createOpen = ref(false)
const selectedId = ref('')
const editName = ref('')
const editDescription = ref('')
const editDefaultEnv = ref('')
const deleteMode = ref<'empty-only' | 'move-to-default' | 'purge'>('empty-only')
const importInputRef = ref<HTMLInputElement | null>(null)

const projects = computed(() => projectStore.projects)
const selected = computed(() => projects.value.find((p) => p.id === selectedId.value) ?? null)

const deleteModeOptions = computed<SelectOption[]>(() => [
  {value: 'empty-only', label: t('settings.projects.deleteModes.emptyOnly')},
  {value: 'move-to-default', label: t('settings.projects.deleteModes.moveToDefault')},
  {value: 'purge', label: t('settings.projects.deleteModes.purge')},
])

const defaultEnvOptions = computed<SelectOption[]>(() => [
  {value: '', label: t('settings.projects.defaultEnvNone')},
  {value: 'dev', label: 'dev'},
  {value: 'staging', label: 'staging'},
  {value: 'prod', label: 'prod'},
])

function apiError(error: unknown, fallbackKey: string) {
  return resolveDisplayApiErrorMessage(error, (key) => String(t(key))) || t(fallbackKey)
}

function projectErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null
  const raw = error.message.trim()
  if (raw.startsWith('PROJECT_')) return raw
  if (error.data && typeof error.data === 'object') {
    const code = (error.data as {errorCode?: unknown}).errorCode
    if (typeof code === 'string' && code.startsWith('PROJECT_')) return code
  }
  return null
}

function initial(name: string) {
  const text = name.trim()
  return text ? text.slice(0, 1).toUpperCase() : '?'
}

function statusLabel(project: ProjectDto) {
  if (project.isDefault) return t('settings.projects.defaultTag')
  if (project.archived) return t('settings.projects.archivedTag')
  return t('settings.projects.activeTag')
}

function statusTone(project: ProjectDto) {
  if (project.isDefault) return 'ok'
  if (project.archived) return 'warn'
  return 'neutral'
}

function selectProject(project: ProjectDto) {
  selectedId.value = project.id
  editName.value = project.name
  editDescription.value = project.description?.trim() || ''
  editDefaultEnv.value = project.defaultEnv?.trim() || ''
}

async function reload() {
  loading.value = true
  try {
    await projectStore.load()
    if (!selectedId.value && projects.value[0]) {
      selectProject(projects.value[0])
    } else if (selectedId.value) {
      const hit = projects.value.find((p) => p.id === selectedId.value)
      if (hit) selectProject(hit)
      else if (projects.value[0]) selectProject(projects.value[0])
      else selectedId.value = ''
    }
  } catch (error) {
    toast.error(apiError(error, 'settings.projects.loadFailed'))
  } finally {
    loading.value = false
  }
}

async function saveSelected() {
  if (!selected.value) return
  const name = editName.value.trim()
  if (!name) {
    toast.error(t('settings.projects.nameRequired'))
    return
  }
  saving.value = true
  try {
    await projectStore.updateProject(selected.value.id, {
      name,
      description: editDescription.value.trim(),
      defaultEnv: editDefaultEnv.value.trim() || null,
    })
  } catch (error) {
    toast.error(apiError(error, 'settings.projects.saveFailed'))
  } finally {
    saving.value = false
  }
}

async function exportSelected() {
  if (!selected.value) return
  saving.value = true
  try {
    const {blob, fileName} = await projectsApi.exportPackage(selected.value.id)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName || `project-${selected.value.id}.zip`
    anchor.click()
    URL.revokeObjectURL(url)
    toast.notify({
      category: 'export',
      titleKey: 'exportDone',
      bodyKey: 'exportDone',
      params: {name: t('settings.projects.exported')},
    })
  } catch (error) {
    toast.error(apiError(error, 'settings.projects.exportFailed'))
  } finally {
    saving.value = false
  }
}

function triggerImport() {
  importInputRef.value?.click()
}

async function onImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  saving.value = true
  try {
    const created = await projectStore.importProject(file)
    toast.notify({
      category: 'workspace',
      titleKey: 'importDone',
      bodyKey: 'importDone',
      params: {detail: t('settings.projects.imported', {name: created.name})},
    })
    selectProject(created)
    await reload()
  } catch (error) {
    toast.error(apiError(error, 'settings.projects.importFailed'))
  } finally {
    saving.value = false
  }
}

async function onConfirmCreate(payload: {name: string; templateId: ProjectTemplateId}) {
  saving.value = true
  try {
    const created = await projectStore.createProject(payload.name, {
      switchTo: false,
      templateId: payload.templateId,
    })
    selectProject(created)
    await reload()
  } catch (error) {
    toast.error(apiError(error, 'settings.projects.createFailed'))
  } finally {
    saving.value = false
  }
}

async function toggleArchive() {
  if (!selected.value || selected.value.isDefault) return
  const nextArchived = !selected.value.archived
  saving.value = true
  try {
    await projectStore.updateProject(selected.value.id, {
      archived: nextArchived,
    })
  } catch (error) {
    toast.error(apiError(error, 'settings.projects.saveFailed'))
  } finally {
    saving.value = false
  }
}

async function deleteSelected() {
  if (!selected.value || selected.value.isDefault) return
  const mode = deleteMode.value
  const ok = await askConfirm({
    title: t('settings.projects.deleteTitle'),
    message: t(`settings.projects.deleteMessages.${mode === 'move-to-default' ? 'moveToDefault' : mode === 'purge' ? 'purge' : 'emptyOnly'}`, {
      name: selected.value.name,
    }),
    confirmLabel: t('settings.projects.deleteConfirm'),
    confirmVariant: 'danger',
  })
  if (!ok) return
  saving.value = true
  try {
    await projectStore.deleteProject(selected.value.id, {
      mode,
      confirmPurgeConnections: mode === 'purge',
    })
    selectedId.value = ''
    await reload()
  } catch (error) {
    const code = projectErrorCode(error)
    if (code === 'PROJECT_NOT_EMPTY') {
      toast.error(t('settings.projects.deleteNotEmpty'))
    } else if (code === 'PROJECT_PURGE_CONNECTIONS_CONFIRM_REQUIRED') {
      toast.error(t('settings.projects.purgeConfirmRequired'))
    } else {
      toast.error(apiError(error, 'settings.projects.deleteFailed'))
    }
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void reload()
})
</script>

<template>
  <SettingsPageShell
      width="wide"
      :title="t('settings.projects.title')"
      :subtitle="t('settings.projects.subtitle')"
  >
    <template #actions>
      <DwButton
          class="settings-head-btn"
          variant="secondary"
          size="sm"
          :disabled="saving || loading"
          @click="triggerImport"
      >
        {{ t('settings.projects.import') }}
      </DwButton>
      <DwButton
          class="settings-head-btn"
          variant="secondary"
          size="sm"
          :disabled="loading"
          @click="reload"
      >
        {{ t('common.refresh') }}
      </DwButton>
    </template>

    <template #tips>
      <SettingsTipsCard
          :title="t('settings.projects.title')"
          :content="t('settings.projects.tips')"
          icon="folder"
      />
    </template>

    <input
        ref="importInputRef"
        type="file"
        accept=".zip,application/zip"
        class="pj-file-input"
        @change="onImportFile"
    >

    <DwSplitPane
        class="pj-workbench"
        storage-key="dw.split.settings-projects"
        default-ratio="third"
        :default-width="260"
        :min-width="220"
        :max-width="480"
        :stack-below="900"
        start-class="pj-sidebar"
        end-class="pj-editor"
    >
      <template #start>
        <div class="pj-sidebar__head">
          <div>
            <h3>{{ t('settings.projects.listTitle') }}</h3>
            <p class="hint">{{ t('settings.projects.listHint') }}</p>
          </div>
          <DwButton variant="primary" size="sm" :disabled="saving" @click="createOpen = true">
            {{ t('settings.projects.create') }}
          </DwButton>
        </div>

        <p v-if="loading" class="hint pj-sidebar__loading">{{ t('common.panelLoading') }}</p>
        <div v-else class="pj-sidebar__list" role="listbox">
          <button
              v-for="item in projects"
              :key="item.id"
              type="button"
              class="pj-item"
              :class="{'is-active': item.id === selectedId}"
              role="option"
              :aria-selected="item.id === selectedId"
              @click="selectProject(item)"
          >
            <span class="pj-item__avatar" aria-hidden="true">{{ initial(item.name) }}</span>
            <span class="pj-item__copy">
              <span class="pj-item__name">{{ item.name }}</span>
              <span class="pj-item__meta">{{ item.id }}</span>
            </span>
            <span class="pj-status" :data-tone="statusTone(item)">
              {{ statusLabel(item) }}
            </span>
          </button>
          <EmptyState
              v-if="!projects.length"
              embedded
              compact
              class="pj-sidebar__empty"
              :title="t('settings.projects.empty')"
          />
        </div>
      </template>

      <template #end>
        <template v-if="selected">
          <header class="pj-editor__head">
            <div class="pj-editor__title">
              <span class="pj-item__avatar pj-item__avatar--lg" aria-hidden="true">
                {{ initial(selected.name) }}
              </span>
              <div>
                <h3>{{ selected.name }}</h3>
                <p class="hint">
                  <span class="pj-status pj-status--inline" :data-tone="statusTone(selected)">
                    {{ statusLabel(selected) }}
                  </span>
                  ·
                  <code>{{ selected.id }}</code>
                </p>
              </div>
            </div>
            <div class="pj-editor__actions">
              <DwButton variant="secondary" size="sm" :disabled="saving" @click="exportSelected">
                {{ t('settings.projects.export') }}
              </DwButton>
              <DwButton
                  v-if="!selected.isDefault"
                  variant="secondary"
                  size="sm"
                  :disabled="saving"
                  @click="toggleArchive"
              >
                {{ selected.archived ? t('settings.projects.unarchive') : t('settings.projects.archive') }}
              </DwButton>
            </div>
          </header>

          <div class="pj-editor__body">
            <div class="pj-section">
              <div class="pj-section__copy">
                <h4>{{ t('settings.projects.detailTitle') }}</h4>
                <p class="hint">{{ t('settings.projects.detailHint') }}</p>
              </div>
              <div class="pj-stack">
                <FormField :label="t('settings.projects.fields.name')" input-id="project-edit-name">
                  <template #default="{id}">
                    <DwInput :id="id" v-model="editName" type="text"/>
                  </template>
                </FormField>
                <FormField :label="t('settings.projects.fields.description')" input-id="project-edit-desc">
                  <template #default="{id}">
                    <DwInput :id="id" v-model="editDescription" type="text"/>
                  </template>
                </FormField>
                <FormField :label="t('settings.projects.fields.defaultEnv')">
                  <DwSelect v-model="editDefaultEnv" :options="defaultEnvOptions"/>
                </FormField>
                <div class="pj-actions">
                  <DwButton variant="primary" size="sm" :disabled="saving" @click="saveSelected">
                    {{ t('common.save') }}
                  </DwButton>
                </div>
              </div>
            </div>

            <div v-if="!selected.isDefault" class="pj-section pj-section--danger">
              <div class="pj-section__copy">
                <h4>{{ t('settings.projects.deleteSection') }}</h4>
                <p class="hint">{{ t('settings.projects.deleteHint') }}</p>
              </div>
              <div class="pj-stack">
                <FormField :label="t('settings.projects.deleteModeLabel')">
                  <DwSelect v-model="deleteMode" :options="deleteModeOptions"/>
                </FormField>
                <div class="pj-actions">
                  <DwButton variant="danger" size="sm" :disabled="saving" @click="deleteSelected">
                    {{ t('settings.projects.deleteConfirm') }}
                  </DwButton>
                </div>
              </div>
            </div>
          </div>
        </template>

        <EmptyState
            v-else-if="!loading"
            class="pj-editor__empty"
            :title="t('settings.projects.selectHint')"
        >
          <template #icon>
            <DwIcon name="folder" :size="32" :stroke-width="1.4"/>
          </template>
        </EmptyState>
      </template>
    </DwSplitPane>

    <CreateProjectDialog
        :open="createOpen"
        @update:open="createOpen = $event"
        @confirm="onConfirmCreate"
    />

    <ConfirmDialog
        :open="confirmOpen"
        :title="confirmTitle"
        :message="confirmMessage"
        :confirm-label="confirmLabel"
        :confirm-variant="confirmVariant"
        @update:open="onConfirmOpenUpdate"
        @confirm="onConfirmDialog"
    />
  </SettingsPageShell>
</template>

<style scoped>
.pj-file-input {
  display: none;
}

.pj-workbench.dw-split-pane {
  gap: var(--mp-gap-lg);
  align-items: start;
  min-height: clamp(420px, 58vh, 640px);
}

:deep(.pj-sidebar),
:deep(.pj-editor) {
  border: 1px solid var(--dw-panel-border);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-editor);
  box-shadow: var(--dw-panel-shadow);
  min-height: 0;
}

:deep(.pj-sidebar) {
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 0;
  max-height: clamp(420px, 58vh, 640px);
}

.pj-sidebar__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--dw-space-3);
  padding: var(--dw-space-7);
  border-bottom: 1px solid var(--dw-border-light);
}

.pj-sidebar__head h3,
.pj-editor__title h3,
.pj-section__copy h4 {
  margin: 0;
  font-size: var(--dw-text-lg);
  font-weight: 600;
}

.pj-sidebar__head .hint,
.pj-editor .hint,
.pj-section__copy .hint {
  margin: var(--dw-space-2) 0 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading);
}

.pj-sidebar__loading,
.pj-sidebar__empty {
  padding: var(--dw-space-6);
}

.pj-sidebar__list {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-xs);
  padding: var(--dw-space-5);
  overflow: auto;
}

.pj-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--dw-space-3);
  width: 100%;
  padding: var(--dw-space-3) var(--dw-space-4);
  border: 1px solid transparent;
  border-radius: var(--dw-control-radius);
  background: transparent;
  text-align: left;
  cursor: pointer;
  color: inherit;
  transition: background var(--dw-transition-fast), border-color var(--dw-transition-fast);
}

.pj-item:hover {
  background: var(--dw-surface-muted);
}

.pj-item.is-active {
  background: var(--dw-surface-muted);
  border-color: var(--dw-border-strong);
}

.pj-item__avatar {
  display: grid;
  place-items: center;
  width: var(--dw-control-h);
  height: var(--dw-control-h);
  border-radius: var(--dw-control-radius);
  background: var(--dw-surface-raised);
  border: 1px solid var(--dw-border);
  font-size: var(--dw-text-sm);
  font-weight: 600;
  color: var(--dw-text);
}

.pj-item__avatar--lg {
  width: var(--dw-density-lg);
  height: var(--dw-density-lg);
  font-size: var(--dw-text-md);
}

.pj-item__copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}

.pj-item__name {
  font-weight: 600;
  font-size: var(--dw-text-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pj-item__meta {
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-family: var(--dw-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pj-status {
  display: inline-flex;
  align-items: center;
  padding: 2px var(--dw-space-2);
  border-radius: var(--dw-control-radius-sm);
  font-size: var(--dw-text-xs);
  font-weight: 500;
  background: var(--dw-surface-muted);
  color: var(--dw-text-muted);
  white-space: nowrap;
}

.pj-status[data-tone='ok'] {
  background: color-mix(in srgb, var(--dw-success) 16%, transparent);
  color: var(--dw-success);
}

.pj-status[data-tone='warn'] {
  background: color-mix(in srgb, var(--dw-warning) 16%, transparent);
  color: var(--dw-warning);
}

.pj-status--inline {
  vertical-align: baseline;
}

.pj-editor {
  display: flex;
  flex-direction: column;
  min-height: clamp(420px, 58vh, 640px);
}

.pj-editor__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--dw-space-4);
  padding: var(--dw-space-7);
  border-bottom: 1px solid var(--dw-border-light);
}

.pj-editor__title {
  display: flex;
  align-items: center;
  gap: var(--dw-space-4);
  min-width: 0;
}

.pj-editor__actions,
.pj-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-space-2);
}

.pj-editor__body {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-7);
  padding: var(--dw-space-7);
}

.pj-section {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-4);
}

.pj-section--danger {
  padding-top: var(--dw-space-6);
  border-top: 1px solid var(--dw-border-light);
}

.pj-stack {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-3);
  max-width: 480px;
}

.pj-editor__empty {
  flex: 1;
  padding: var(--dw-space-10);
}

@media (max-width: 900px) {
  :deep(.pj-sidebar) {
    position: static;
    max-height: none;
  }
}
</style>
