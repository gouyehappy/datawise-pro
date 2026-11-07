<script setup lang="ts">
import {computed, reactive, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton, DwCheckbox, DwInput} from '@/core/components'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import SettingsSectionCard from '@/features/settings/components/SettingsSectionCard.vue'
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

const exportDomains = reactive<ProfileDomainOptions>({...DEFAULT_PROFILE_DOMAINS})
const importDomains = reactive<ProfileDomainOptions>({...DEFAULT_PROFILE_DOMAINS})
const exportPassphrase = ref('')
const exportConfirm = ref('')
const importPassphrase = ref('')
const importFile = ref<File | null>(null)
const preflight = ref<ProfilePreflightResult | null>(null)
const busy = ref(false)
const fileInputRef = ref<HTMLInputElement>()

const passphraseMismatch = computed(
    () => exportPassphrase.value.length > 0
        && exportConfirm.value.length > 0
        && exportPassphrase.value !== exportConfirm.value,
)
const passphraseTooShort = computed(
    () => exportPassphrase.value.length > 0 && exportPassphrase.value.length < 4,
)
const canExport = computed(
    () => !readOnly.value
        && exportPassphrase.value.length >= 4
        && exportPassphrase.value === exportConfirm.value
        && (exportDomains.connections || exportDomains.app || exportDomains.snippets
            || exportDomains.aiWorkspace || exportDomains.projects
            || exportDomains.savedConsoles || exportDomains.sqlHistory),
)

async function onExport() {
  if (denyIfReadOnly() || !canExport.value) return
  busy.value = true
  try {
    const {blob, fileName} = await exportProfilePackage({
      passphrase: exportPassphrase.value,
      confirmPassphrase: exportConfirm.value,
      domains: {...exportDomains},
    })
    downloadBlob(blob, fileName)
    toast.success(t('settings.configPortability.exportSuccess'))
    exportPassphrase.value = ''
    exportConfirm.value = ''
  } catch (err) {
    toast.error(
        resolveDisplayApiErrorMessage(err, (key) => String(t(key)))
        || t('settings.configPortability.exportFailed'),
    )
  } finally {
    busy.value = false
  }
}

function pickImportFile() {
  fileInputRef.value?.click()
}

function onFileChosen(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  importFile.value = file
  preflight.value = null
  input.value = ''
}

async function onPreflight() {
  if (denyIfReadOnly() || !importFile.value || !importPassphrase.value) return
  busy.value = true
  try {
    preflight.value = await preflightProfilePackage(importFile.value, importPassphrase.value)
    if (!preflight.value.passphraseOk) {
      toast.error(t('settings.configPortability.passphraseIncorrect'))
    } else if (!preflight.value.schemaCompatible) {
      toast.error(t('settings.configPortability.schemaUnsupported'))
    } else {
      toast.success(t('settings.configPortability.preflightOk'))
    }
  } catch (err) {
    toast.error(
        resolveDisplayApiErrorMessage(err, (key) => String(t(key)))
        || t('settings.configPortability.preflightFailed'),
    )
  } finally {
    busy.value = false
  }
}

async function onImport() {
  if (denyIfReadOnly() || !importFile.value || !importPassphrase.value) return
  if (preflight.value && (!preflight.value.passphraseOk || !preflight.value.schemaCompatible)) {
    return
  }
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
    toast.success(t('settings.configPortability.importSuccess'))
    if (result.restartRecommended) {
      toast.warning(t('settings.configPortability.restartRecommended'))
    }
    importPassphrase.value = ''
    importFile.value = null
    preflight.value = null
  } catch (err) {
    toast.error(
        resolveDisplayApiErrorMessage(err, (key) => String(t(key)))
        || t('settings.configPortability.importFailed'),
    )
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
    <SettingsSectionCard
        :title="t('settings.configPortability.exportTitle')"
        :hint="t('settings.configPortability.exportHint')"
        icon="export"
        tone="panel"
    >
      <div class="portability-domains">
        <DwCheckbox v-model="exportDomains.connections" :label="t('settings.configPortability.domain.connections')"/>
        <DwCheckbox v-model="exportDomains.app" :label="t('settings.configPortability.domain.app')"/>
        <DwCheckbox v-model="exportDomains.snippets" :label="t('settings.configPortability.domain.snippets')"/>
        <DwCheckbox v-model="exportDomains.aiWorkspace" :label="t('settings.configPortability.domain.aiWorkspace')"/>
        <DwCheckbox v-model="exportDomains.projects" :label="t('settings.configPortability.domain.projects')"/>
        <DwCheckbox v-model="exportDomains.savedConsoles" :label="t('settings.configPortability.domain.savedConsoles')"/>
        <DwCheckbox v-model="exportDomains.sqlHistory" :label="t('settings.configPortability.domain.sqlHistory')"/>
      </div>
      <div class="portability-fields">
        <label>
          <span>{{ t('settings.configPortability.passphrase') }}</span>
          <DwInput v-model="exportPassphrase" type="password" autocomplete="new-password"/>
        </label>
        <label>
          <span>{{ t('settings.configPortability.confirmPassphrase') }}</span>
          <DwInput v-model="exportConfirm" type="password" autocomplete="new-password"/>
        </label>
      </div>
      <p v-if="passphraseTooShort" class="portability-warn">{{ t('settings.configPortability.passphraseTooShort') }}</p>
      <p v-else-if="passphraseMismatch" class="portability-warn">{{ t('settings.configPortability.passphraseMismatch') }}</p>
      <p class="portability-muted">{{ t('settings.configPortability.passphraseHint') }}</p>
      <DwButton
          variant="primary"
          size="sm"
          :loading="busy"
          :disabled="!canExport || busy"
          @click="onExport"
      >
        {{ t('settings.configPortability.exportAction') }}
      </DwButton>
    </SettingsSectionCard>

    <SettingsSectionCard
        :title="t('settings.configPortability.importTitle')"
        :hint="t('settings.configPortability.importHint')"
        icon="import"
        tone="panel"
    >
      <input
          ref="fileInputRef"
          class="portability-file-input"
          type="file"
          accept=".dwprofile,.json,.xml,application/zip,application/json,text/xml"
          @change="onFileChosen"
      >
      <div class="portability-file-row">
        <DwButton variant="secondary" size="sm" :disabled="busy || readOnly" @click="pickImportFile">
          {{ t('settings.configPortability.chooseFile') }}
        </DwButton>
        <span class="portability-muted">{{ importFile?.name || t('settings.configPortability.noFile') }}</span>
      </div>
      <div class="portability-domains">
        <DwCheckbox v-model="importDomains.connections" :label="t('settings.configPortability.domain.connections')"/>
        <DwCheckbox v-model="importDomains.app" :label="t('settings.configPortability.domain.app')"/>
        <DwCheckbox v-model="importDomains.snippets" :label="t('settings.configPortability.domain.snippets')"/>
        <DwCheckbox v-model="importDomains.aiWorkspace" :label="t('settings.configPortability.domain.aiWorkspace')"/>
        <DwCheckbox v-model="importDomains.projects" :label="t('settings.configPortability.domain.projects')"/>
        <DwCheckbox v-model="importDomains.savedConsoles" :label="t('settings.configPortability.domain.savedConsoles')"/>
        <DwCheckbox v-model="importDomains.sqlHistory" :label="t('settings.configPortability.domain.sqlHistory')"/>
      </div>
      <fieldset class="portability-conflict">
        <legend>{{ t('settings.configPortability.projectConflict') }}</legend>
        <label>
          <input v-model="importDomains.projectFileConflict" type="radio" value="preferImported">
          {{ t('settings.configPortability.preferImported') }}
        </label>
        <label>
          <input v-model="importDomains.projectFileConflict" type="radio" value="keepLocal">
          {{ t('settings.configPortability.keepLocal') }}
        </label>
      </fieldset>
      <label class="portability-fields">
        <span>{{ t('settings.configPortability.passphrase') }}</span>
        <DwInput v-model="importPassphrase" type="password" autocomplete="current-password"/>
      </label>
      <div class="portability-actions">
        <DwButton
            variant="secondary"
            size="sm"
            :loading="busy"
            :disabled="busy || readOnly || !importFile || !importPassphrase"
            @click="onPreflight"
        >
          {{ t('settings.configPortability.preflightAction') }}
        </DwButton>
        <DwButton
            variant="primary"
            size="sm"
            :loading="busy"
            :disabled="busy || readOnly || !importFile || !importPassphrase || (preflight != null && (!preflight.passphraseOk || !preflight.schemaCompatible))"
            @click="onImport"
        >
          {{ t('settings.configPortability.importAction') }}
        </DwButton>
      </div>
      <div v-if="preflight" class="portability-preflight">
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
    </SettingsSectionCard>
  </SettingsPageShell>
</template>

<style scoped>
.portability-domains {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  margin-bottom: 12px;
}

.portability-fields {
  display: grid;
  gap: 10px;
  max-width: 360px;
  margin-bottom: 8px;
}

.portability-fields label,
.portability-fields {
  display: grid;
  gap: 4px;
}

.portability-muted {
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
  margin: 0 0 12px;
}

.portability-warn {
  color: var(--dw-danger);
  font-size: var(--dw-text-sm);
  margin: 0 0 8px;
}

.portability-file-input {
  display: none;
}

.portability-file-row,
.portability-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.portability-preflight {
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--dw-surface-muted, rgba(0, 0, 0, 0.04));
  font-size: var(--dw-text-md);
}

.portability-conflict {
  border: 0;
  margin: 0 0 12px;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
}

.portability-conflict legend {
  width: 100%;
  font-size: var(--dw-text-sm);
  margin-bottom: 4px;
}

.portability-preflight ul {
  margin: 8px 0 0;
  padding-left: 18px;
}
</style>
