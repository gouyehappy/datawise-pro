<script setup lang="ts">
import {computed, reactive, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {
  AppModal,
  DwButton,
  DwInlineAlert,
  DwInput,
  FormField,
  ModalActions,
  SettingsSelect,
} from '@/core/components'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import SettingsActions from '@/features/settings/components/SettingsActions.vue'
import ConfigHubCard from '@/features/settings/components/ConfigHubCard.vue'
import ConfigCloudSyncSettingsPanel from '@/features/settings/components/ConfigCloudSyncSettingsPanel.vue'
import ProfileDomainPicker from '@/features/settings/components/ProfileDomainPicker.vue'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useResourceWriteGuard} from '@/features/auth/composables/useResourceWriteGuard'
import {UserResource} from '@/features/auth/types/user-resource.types'
import {resolveDisplayApiErrorMessage} from '@/shared/api/http/api-error-message'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useShortcutPanelStore} from '@/features/layout/stores/shortcut-panel-store'
import {syncSqlEditorLayersFromServer} from '@/features/settings/services/sql-editor-shortcuts.service'
import {
  DEFAULT_PROFILE_DOMAINS,
  downloadBlob,
  exportProfilePackage,
  importProfilePackage,
  preflightProfilePackage,
  type ProfileDomainOptions,
  type ProfilePreflightResult,
} from '@/features/settings/services/config-portability.service'

const {t} = useI18n()
const toast = useAppToast()
const appConfig = useAppConfigStore()
const explorer = useExplorerStore()
const shortcutPanel = useShortcutPanelStore()
const {readOnly, denyIfReadOnly} = useResourceWriteGuard(UserResource.AppConfig)

const projectConflictOptions = computed(() => [
  {value: 'preferImported', label: t('settings.configPortability.preferImported')},
  {value: 'keepLocal', label: t('settings.configPortability.keepLocal')},
])

const exportDomains = reactive<ProfileDomainOptions>({...DEFAULT_PROFILE_DOMAINS})
const importDomains = reactive<ProfileDomainOptions>({...DEFAULT_PROFILE_DOMAINS})
const exportPassphrase = ref('')
const exportConfirm = ref('')
const importPassphrase = ref('')
const importFile = ref<File | null>(null)
const preflight = ref<ProfilePreflightResult | null>(null)
const busy = ref(false)
const fileInputRef = ref<HTMLInputElement>()
const exportOpen = ref(false)
const importOpen = ref(false)
const exportError = ref('')
const importError = ref('')

const passphraseMismatch = computed(
    () => exportPassphrase.value.length > 0
        && exportConfirm.value.length > 0
        && exportPassphrase.value !== exportConfirm.value,
)
const passphraseTooShort = computed(
    () => exportPassphrase.value.length > 0 && exportPassphrase.value.length < 4,
)
const hasDomain = (domains: ProfileDomainOptions) =>
    domains.connections || domains.app || domains.snippets
        || domains.aiWorkspace || domains.projects
        || domains.savedConsoles || domains.sqlHistory

const canExport = computed(
    () => !readOnly.value
        && exportPassphrase.value.length >= 4
        && exportPassphrase.value === exportConfirm.value
        && hasDomain(exportDomains),
)

const canImport = computed(
    () => !readOnly.value
        && !!importFile.value
        && !!importPassphrase.value
        && hasDomain(importDomains)
        && (preflight.value == null
            || (preflight.value.passphraseOk && preflight.value.schemaCompatible)),
)

function openExport() {
  if (denyIfReadOnly()) return
  exportError.value = ''
  exportOpen.value = true
}

function closeExport() {
  exportOpen.value = false
  exportError.value = ''
}

function openImport() {
  if (denyIfReadOnly()) return
  importError.value = ''
  importOpen.value = true
}

function closeImport() {
  importOpen.value = false
  importError.value = ''
}

async function onExport() {
  if (denyIfReadOnly() || !canExport.value) return
  exportError.value = ''
  if (passphraseTooShort.value) {
    exportError.value = t('settings.configPortability.passphraseTooShort')
    return
  }
  if (passphraseMismatch.value) {
    exportError.value = t('settings.configPortability.passphraseMismatch')
    return
  }
  busy.value = true
  try {
    const {blob, fileName} = await exportProfilePackage({
      passphrase: exportPassphrase.value,
      confirmPassphrase: exportConfirm.value,
      domains: {...exportDomains},
    })
    downloadBlob(blob, fileName)
    closeExport()
    toast.notify({
      category: 'export',
      titleKey: 'exportDone',
      bodyKey: 'exportDone',
      params: {name: t('settings.configPortability.exportSuccess')},
    })
    exportPassphrase.value = ''
    exportConfirm.value = ''
  } catch (err) {
    exportError.value = resolveDisplayApiErrorMessage(err, (key) => String(t(key)))
        || t('settings.configPortability.exportFailed')
  } finally {
    busy.value = false
  }
}

function pickImportFile() {
  fileInputRef.value?.click()
}

function onFileChosen(event: Event) {
  const input = event.target as HTMLInputElement
  importFile.value = input.files?.[0] ?? null
  preflight.value = null
  importError.value = ''
  input.value = ''
}

async function onPreflight() {
  if (denyIfReadOnly() || !importFile.value || !importPassphrase.value) return
  importError.value = ''
  busy.value = true
  try {
    preflight.value = await preflightProfilePackage(importFile.value, importPassphrase.value)
    if (!preflight.value.passphraseOk) {
      importError.value = t('settings.configPortability.passphraseIncorrect')
    } else if (!preflight.value.schemaCompatible) {
      importError.value = t('settings.configPortability.schemaUnsupported')
    }
  } catch (err) {
    importError.value = resolveDisplayApiErrorMessage(err, (key) => String(t(key)))
        || t('settings.configPortability.preflightFailed')
  } finally {
    busy.value = false
  }
}

async function onImport() {
  if (denyIfReadOnly() || !canImport.value || !importFile.value || !importPassphrase.value) return
  if (preflight.value && (!preflight.value.passphraseOk || !preflight.value.schemaCompatible)) {
    return
  }
  importError.value = ''
  busy.value = true
  try {
    const result = await importProfilePackage(
        importFile.value,
        importPassphrase.value,
        {...importDomains},
    )
    await Promise.all([
      appConfig.syncFromServer(),
      explorer.refreshTree(),
      syncSqlEditorLayersFromServer(),
      shortcutPanel.load(),
    ])
    closeImport()
    toast.notify({
      category: 'workspace',
      titleKey: 'importDone',
      bodyKey: 'importDone',
      params: {name: t('settings.configPortability.importSuccess')},
    })
    if (result.restartRecommended) {
      toast.warning(t('settings.configPortability.restartRecommended'))
    }
    importPassphrase.value = ''
    importFile.value = null
    preflight.value = null
  } catch (err) {
    importError.value = resolveDisplayApiErrorMessage(err, (key) => String(t(key)))
        || t('settings.configPortability.importFailed')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <SettingsPageShell
      id="settings-config-portability"
      :title="t('settings.configPortability.title')"
      :subtitle="t('settings.configPortability.subtitle')"
  >
    <div class="config-hub-stack">
      <section class="config-hub-group">
        <header class="config-hub-group__head">
          <h3 class="config-hub-group__title">{{ t('settings.configPortability.hubGroupTitle') }}</h3>
          <p class="config-hub-group__hint">{{ t('settings.configPortability.hubGroupHint') }}</p>
        </header>
        <div class="config-hub">
          <ConfigHubCard
              :title="t('settings.configPortability.exportTitle')"
              :hint="t('settings.configPortability.exportHint')"
              icon="export"
              :action-label="t('settings.configPortability.hubOpen')"
              :disabled="readOnly"
              @click="openExport"
          />
          <ConfigHubCard
              :title="t('settings.configPortability.importTitle')"
              :hint="t('settings.configPortability.importHint')"
              icon="import"
              :action-label="t('settings.configPortability.hubOpen')"
              :disabled="readOnly"
              @click="openImport"
          />
        </div>
      </section>

      <ConfigCloudSyncSettingsPanel embedded/>
    </div>
  </SettingsPageShell>

  <AppModal
      :open="exportOpen"
      :title="t('settings.configPortability.exportTitle')"
      :subtitle="t('settings.configPortability.exportModalSubtitle')"
      width="560px"
      @close="closeExport"
  >
    <form class="modal-form modal-form--compact" @submit.prevent="onExport">
      <div class="config-modal-section">
        <p class="config-modal-label">{{ t('settings.configPortability.exportTitle') }}</p>
        <ProfileDomainPicker
            v-model="exportDomains"
            :aria-label="t('settings.configPortability.exportTitle')"
            :disabled="readOnly"
        />
      </div>
      <FormField
          :label="t('settings.configPortability.passphrase')"
          :hint="t('settings.configPortability.passphraseHint')"
      >
        <DwInput v-model="exportPassphrase" type="password" autocomplete="new-password"/>
      </FormField>
      <FormField :label="t('settings.configPortability.confirmPassphrase')">
        <DwInput v-model="exportConfirm" type="password" autocomplete="new-password"/>
      </FormField>
      <DwInlineAlert
          v-if="exportError || passphraseTooShort || passphraseMismatch"
          :message="exportError
            || (passphraseTooShort
              ? t('settings.configPortability.passphraseTooShort')
              : t('settings.configPortability.passphraseMismatch'))"
          density="banner"
      />
    </form>
    <template #footer>
      <ModalActions
          :confirm-label="t('settings.configPortability.exportAction')"
          :confirm-disabled="!canExport || busy"
          :confirm-loading="busy"
          @cancel="closeExport"
          @confirm="onExport"
      />
    </template>
  </AppModal>

  <AppModal
      :open="importOpen"
      :title="t('settings.configPortability.importTitle')"
      :subtitle="t('settings.configPortability.importModalSubtitle')"
      width="560px"
      @close="closeImport"
  >
    <input
        ref="fileInputRef"
        class="config-file-input"
        type="file"
        accept=".dwprofile,.json,.xml,application/zip,application/json,text/xml"
        @change="onFileChosen"
    >
    <form class="modal-form modal-form--compact" @submit.prevent="onImport">
      <FormField
          :label="t('settings.configPortability.chooseFile')"
          :hint="importFile?.name || t('settings.configPortability.noFile')"
      >
        <DwButton variant="secondary" size="sm" :disabled="busy || readOnly" @click="pickImportFile">
          {{ t('settings.configPortability.chooseFile') }}
        </DwButton>
      </FormField>
      <div class="config-modal-section">
        <p class="config-modal-label">{{ t('settings.configPortability.importTitle') }}</p>
        <ProfileDomainPicker
            v-model="importDomains"
            :aria-label="t('settings.configPortability.importTitle')"
            :disabled="readOnly"
        />
      </div>
      <FormField :label="t('settings.configPortability.projectConflict')">
        <SettingsSelect
            :model-value="importDomains.projectFileConflict ?? 'preferImported'"
            :options="projectConflictOptions"
            @update:model-value="importDomains.projectFileConflict = $event as 'preferImported' | 'keepLocal'"
        />
      </FormField>
      <FormField :label="t('settings.configPortability.passphrase')">
        <DwInput v-model="importPassphrase" type="password" autocomplete="current-password"/>
      </FormField>
      <div v-if="preflight" class="config-preflight">
        <p>{{ t('settings.configPortability.preflightSummary', {
          connections: preflight.counts?.connections ?? '—',
          conflicts: preflight.conflicts?.length ?? 0,
        }) }}</p>
        <ul v-if="preflight.conflicts?.length">
          <li v-for="item in preflight.conflicts" :key="`${item.domain}-${item.id}`">
            {{ item.domain }} · {{ item.name || item.id }} · {{ item.action }}
          </li>
        </ul>
        <ul v-if="preflight.warnings?.length">
          <li v-for="(w, i) in preflight.warnings" :key="i">{{ w }}</li>
        </ul>
      </div>
      <DwInlineAlert v-if="importError" :message="importError" density="banner"/>
    </form>
    <template #footer>
      <SettingsActions>
        <DwButton variant="ghost" type="button" @click="closeImport">
          {{ t('common.cancel') }}
        </DwButton>
        <DwButton
            variant="secondary"
            type="button"
            :loading="busy"
            :disabled="busy || readOnly || !importFile || !importPassphrase"
            @click="onPreflight"
        >
          {{ t('settings.configPortability.preflightAction') }}
        </DwButton>
        <DwButton
            variant="primary"
            type="button"
            :loading="busy"
            :disabled="!canImport || busy"
            @click="onImport"
        >
          {{ t('settings.configPortability.importAction') }}
        </DwButton>
      </SettingsActions>
    </template>
  </AppModal>
</template>

<style scoped>
.config-hub-stack {
  display: grid;
  gap: var(--dw-space-6);
  max-width: 48rem;
}

.config-hub-group {
  display: grid;
  gap: var(--dw-space-3);
}

.config-hub-group__head {
  display: grid;
  gap: var(--dw-space-1);
}

.config-hub-group__title {
  margin: 0;
  font-size: var(--dw-text-md);
  font-weight: 650;
  color: var(--dw-text);
  line-height: var(--dw-leading-snug);
}

.config-hub-group__hint {
  margin: 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  line-height: var(--dw-leading-relaxed);
}

.config-hub {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--dw-space-3);
}

@media (max-width: 640px) {
  .config-hub {
    grid-template-columns: 1fr;
  }
}

.config-file-input {
  display: none;
}

.config-modal-section {
  display: grid;
  gap: var(--dw-space-2);
}

.config-modal-label {
  margin: 0;
  font-size: var(--dw-text-xs);
  font-weight: 600;
  color: var(--dw-text-secondary);
}

.config-preflight {
  padding: var(--dw-space-3) var(--dw-space-4);
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius);
  background: color-mix(in srgb, var(--dw-text) 4%, transparent);
  font-size: var(--dw-text-sm);
  color: var(--dw-text-secondary);
}

.config-preflight p {
  margin: 0;
}

.config-preflight ul {
  margin: var(--dw-space-2) 0 0;
  padding-left: var(--dw-space-6);
}
</style>
