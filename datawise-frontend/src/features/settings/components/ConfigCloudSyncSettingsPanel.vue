<script setup lang="ts">
import {computed, onMounted, reactive, ref} from 'vue'
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
  downloadBlob,
  exportProfilePackage,
  importProfilePackage,
  preflightProfilePackage,
  type ProfileDomainOptions,
  type ProfilePreflightResult,
} from '@/features/settings/services/config-portability.service'
import {
  DEFAULT_SYNC_DOMAINS,
  downloadCloudSyncWebDav,
  fetchCloudSyncSettings,
  saveCloudSyncSettings,
  testCloudSyncWebDav,
  uploadCloudSyncWebDav,
  type CloudSyncWebDavSettings,
} from '@/features/settings/services/config-cloud-sync.service'

const {t} = useI18n()
const toast = useAppToast()
const appConfig = useAppConfigStore()
const explorer = useExplorerStore()
const shortcutPanel = useShortcutPanelStore()
const {readOnly, denyIfReadOnly} = useResourceWriteGuard(UserResource.AppConfig)

const syncDomains = reactive<ProfileDomainOptions>({...DEFAULT_SYNC_DOMAINS})
const webdav = reactive<CloudSyncWebDavSettings>({
  baseUrl: '',
  username: '',
  password: '',
  hasPassword: false,
  remotePath: 'datawise/profile-sync.dwprofile',
})
const importFile = ref<File | null>(null)
const preflight = ref<ProfilePreflightResult | null>(null)
const busy = ref(false)
const fileInputRef = ref<HTMLInputElement>()

const canPackage = computed(
    () => !readOnly.value
        && (syncDomains.connections || syncDomains.app || syncDomains.snippets
            || syncDomains.aiWorkspace || syncDomains.projects
            || syncDomains.savedConsoles || syncDomains.sqlHistory),
)

const canWebDav = computed(
    () => canPackage.value && webdav.baseUrl.trim().length > 0,
)

onMounted(async () => {
  try {
    const settings = await fetchCloudSyncSettings()
    webdav.baseUrl = settings.baseUrl
    webdav.username = settings.username
    webdav.hasPassword = settings.hasPassword
    webdav.remotePath = settings.remotePath
    webdav.password = ''
  } catch {
    // optional: panel still usable for local redacted packages
  }
})

async function onDownloadPackage() {
  if (denyIfReadOnly() || !canPackage.value) return
  busy.value = true
  try {
    const {blob, fileName} = await exportProfilePackage({
      domains: {...syncDomains},
      includeSecrets: false,
    })
    downloadBlob(blob, fileName.startsWith('datawise-') ? fileName.replace('profile', 'sync') : fileName)
    toast.notify({
      category: 'export',
      titleKey: 'exportDone',
      bodyKey: 'exportDone',
      params: {name: t('settings.configCloudSync.packageDownloaded')},
    })
  } catch (err) {
    toast.error(
        resolveDisplayApiErrorMessage(err, (key) => String(t(key)))
        || t('settings.configCloudSync.packageFailed'),
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
  importFile.value = input.files?.[0] ?? null
  preflight.value = null
  input.value = ''
}

async function onPreflight() {
  if (denyIfReadOnly() || !importFile.value) return
  busy.value = true
  try {
    const result = await preflightProfilePackage(importFile.value, '')
    preflight.value = result
    if (!result.schemaCompatible) {
      toast.error(t('settings.configPortability.schemaUnsupported'))
      return
    }
    if (!result.passphraseOk && result.manifest?.secretMode !== 'omitted') {
      toast.error(t('settings.configPortability.passphraseIncorrect'))
      return
    }
    toast.success(t('settings.configPortability.preflightOk'))
  } catch (err) {
    toast.error(
        resolveDisplayApiErrorMessage(err, (key) => String(t(key)))
        || t('settings.configPortability.preflightFailed'),
    )
  } finally {
    busy.value = false
  }
}

async function refreshAfterImport() {
  await Promise.allSettled([
    appConfig.syncFromServer(),
    explorer.refreshTree(),
    syncSqlEditorLayersFromServer(),
    shortcutPanel.load(),
  ])
}

async function onApply() {
  if (denyIfReadOnly() || !importFile.value || !preflight.value?.schemaCompatible) return
  busy.value = true
  try {
    const result = await importProfilePackage(importFile.value, '', {...syncDomains})
    await refreshAfterImport()
    toast.success(t('settings.configCloudSync.applySuccess'))
    if (result.restartRecommended) {
      toast.warning(t('settings.configPortability.restartRecommended'))
    }
    importFile.value = null
    preflight.value = null
  } catch (err) {
    toast.error(
        resolveDisplayApiErrorMessage(err, (key) => String(t(key)))
        || t('settings.configCloudSync.applyFailed'),
    )
  } finally {
    busy.value = false
  }
}

async function onSaveWebDav() {
  if (denyIfReadOnly()) return
  busy.value = true
  try {
    const saved = await saveCloudSyncSettings({...webdav})
    webdav.hasPassword = saved.hasPassword
    webdav.password = ''
    toast.success(t('settings.configCloudSync.webdavSaved'))
  } catch (err) {
    toast.error(
        resolveDisplayApiErrorMessage(err, (key) => String(t(key)))
        || t('settings.configCloudSync.webdavSaveFailed'),
    )
  } finally {
    busy.value = false
  }
}

async function onTestWebDav() {
  if (denyIfReadOnly() || !webdav.baseUrl.trim()) return
  busy.value = true
  try {
    await testCloudSyncWebDav({
      baseUrl: webdav.baseUrl,
      username: webdav.username,
      password: webdav.password,
      remotePath: webdav.remotePath,
      hasPassword: webdav.hasPassword,
    })
    toast.success(t('settings.configCloudSync.webdavTestOk'))
  } catch (err) {
    toast.error(
        resolveDisplayApiErrorMessage(err, (key) => String(t(key)))
        || t('settings.configCloudSync.webdavTestFailed'),
    )
  } finally {
    busy.value = false
  }
}

async function onUploadWebDav() {
  if (denyIfReadOnly() || !canWebDav.value) return
  busy.value = true
  try {
    await uploadCloudSyncWebDav({...syncDomains}, {
      baseUrl: webdav.baseUrl,
      username: webdav.username,
      password: webdav.password,
      remotePath: webdav.remotePath,
      hasPassword: webdav.hasPassword,
    }, false)
    toast.success(t('settings.configCloudSync.webdavUploadOk'))
  } catch (err) {
    toast.error(
        resolveDisplayApiErrorMessage(err, (key) => String(t(key)))
        || t('settings.configCloudSync.webdavUploadFailed'),
    )
  } finally {
    busy.value = false
  }
}

async function onDownloadWebDav() {
  if (denyIfReadOnly() || !webdav.baseUrl.trim()) return
  busy.value = true
  try {
    const {blob, fileName} = await downloadCloudSyncWebDav({
      baseUrl: webdav.baseUrl,
      username: webdav.username,
      password: webdav.password,
      remotePath: webdav.remotePath,
      hasPassword: webdav.hasPassword,
    })
    const file = new File([blob], fileName, {type: 'application/octet-stream'})
    importFile.value = file
    preflight.value = await preflightProfilePackage(file, '')
    toast.success(t('settings.configCloudSync.webdavDownloadOk'))
  } catch (err) {
    toast.error(
        resolveDisplayApiErrorMessage(err, (key) => String(t(key)))
        || t('settings.configCloudSync.webdavDownloadFailed'),
    )
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <SettingsPageShell
      id="settings-config-cloud-sync"
      :title="t('settings.configCloudSync.title')"
      :subtitle="t('settings.configCloudSync.subtitle')"
  >
    <SettingsSectionCard
        :title="t('settings.configCloudSync.domainsTitle')"
        :hint="t('settings.configCloudSync.domainsHint')"
        icon="layers"
        tone="panel"
    >
      <div class="sync-domains">
        <DwCheckbox v-model="syncDomains.connections" :label="t('settings.configPortability.domain.connections')"/>
        <DwCheckbox v-model="syncDomains.app" :label="t('settings.configPortability.domain.app')"/>
        <DwCheckbox v-model="syncDomains.snippets" :label="t('settings.configPortability.domain.snippets')"/>
        <DwCheckbox v-model="syncDomains.savedConsoles" :label="t('settings.configPortability.domain.savedConsoles')"/>
        <DwCheckbox v-model="syncDomains.aiWorkspace" :label="t('settings.configPortability.domain.aiWorkspace')"/>
        <DwCheckbox v-model="syncDomains.projects" :label="t('settings.configPortability.domain.projects')"/>
        <DwCheckbox v-model="syncDomains.sqlHistory" :label="t('settings.configPortability.domain.sqlHistory')"/>
      </div>
      <p class="sync-muted">{{ t('settings.configCloudSync.credentialsDefault') }}</p>
    </SettingsSectionCard>

    <SettingsSectionCard
        :title="t('settings.configCloudSync.packageTitle')"
        :hint="t('settings.configCloudSync.packageHint')"
        icon="export"
        tone="panel"
    >
      <DwButton
          variant="primary"
          size="sm"
          :loading="busy"
          :disabled="!canPackage || busy"
          @click="onDownloadPackage"
      >
        {{ t('settings.configCloudSync.downloadPackage') }}
      </DwButton>
      <input
          ref="fileInputRef"
          class="sync-file-input"
          type="file"
          accept=".dwprofile,application/zip"
          @change="onFileChosen"
      >
      <div class="sync-file-row">
        <DwButton variant="secondary" size="sm" :disabled="busy || readOnly" @click="pickImportFile">
          {{ t('settings.configPortability.chooseFile') }}
        </DwButton>
        <span class="sync-muted">{{ importFile?.name || t('settings.configPortability.noFile') }}</span>
      </div>
      <div class="sync-actions">
        <DwButton
            variant="secondary"
            size="sm"
            :loading="busy"
            :disabled="busy || readOnly || !importFile"
            @click="onPreflight"
        >
          {{ t('settings.configPortability.preflightAction') }}
        </DwButton>
        <DwButton
            variant="primary"
            size="sm"
            :loading="busy"
            :disabled="busy || readOnly || !preflight?.schemaCompatible"
            @click="onApply"
        >
          {{ t('settings.configCloudSync.applyPackage') }}
        </DwButton>
      </div>
      <p v-if="preflight" class="sync-muted">
        {{ t('settings.configCloudSync.preflightSummary', {
          secretMode: preflight.manifest?.secretMode || '—',
          connections: Number(preflight.counts?.connections ?? 0),
        }) }}
      </p>
    </SettingsSectionCard>

    <SettingsSectionCard
        :title="t('settings.configCloudSync.webdavTitle')"
        :hint="t('settings.configCloudSync.webdavHint')"
        icon="link"
        tone="panel"
    >
      <div class="sync-fields">
        <label>
          <span>{{ t('settings.configCloudSync.baseUrl') }}</span>
          <DwInput v-model="webdav.baseUrl" autocomplete="off"/>
        </label>
        <label>
          <span>{{ t('settings.configCloudSync.username') }}</span>
          <DwInput v-model="webdav.username" autocomplete="username"/>
        </label>
        <label>
          <span>{{ t('settings.configCloudSync.password') }}</span>
          <DwInput
              v-model="webdav.password"
              type="password"
              autocomplete="current-password"
              :placeholder="webdav.hasPassword ? t('settings.configCloudSync.passwordKept') : ''"
          />
        </label>
        <label>
          <span>{{ t('settings.configCloudSync.remotePath') }}</span>
          <DwInput v-model="webdav.remotePath" autocomplete="off"/>
        </label>
      </div>
      <div class="sync-actions">
        <DwButton variant="secondary" size="sm" :loading="busy" :disabled="busy || readOnly" @click="onSaveWebDav">
          {{ t('settings.configCloudSync.saveWebdav') }}
        </DwButton>
        <DwButton
            variant="secondary"
            size="sm"
            :loading="busy"
            :disabled="busy || readOnly || !webdav.baseUrl.trim()"
            @click="onTestWebDav"
        >
          {{ t('settings.configCloudSync.testWebdav') }}
        </DwButton>
        <DwButton
            variant="primary"
            size="sm"
            :loading="busy"
            :disabled="!canWebDav || busy"
            @click="onUploadWebDav"
        >
          {{ t('settings.configCloudSync.uploadWebdav') }}
        </DwButton>
        <DwButton
            variant="secondary"
            size="sm"
            :loading="busy"
            :disabled="busy || readOnly || !webdav.baseUrl.trim()"
            @click="onDownloadWebDav"
        >
          {{ t('settings.configCloudSync.downloadWebdav') }}
        </DwButton>
      </div>
    </SettingsSectionCard>
  </SettingsPageShell>
</template>

<style scoped>
.sync-domains {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-bottom: 8px;
}

.sync-fields {
  display: grid;
  gap: 10px;
  margin-bottom: 12px;
}

.sync-fields label {
  display: grid;
  gap: 4px;
  font-size: 12px;
}

.sync-file-input {
  display: none;
}

.sync-file-row,
.sync-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 10px;
}

.sync-muted {
  margin: 8px 0 0;
  color: var(--dw-text-muted, #6b7280);
  font-size: 12px;
}
</style>
