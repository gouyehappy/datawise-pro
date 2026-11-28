<script setup lang="ts">
import {computed, onMounted, reactive, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {
  AppModal,
  DwButton,
  DwInlineAlert,
  DwInput,
  FormField,
  ModalActions,
} from '@/core/components'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import SettingsActions from '@/features/settings/components/SettingsActions.vue'
import ConfigHubCard from '@/features/settings/components/ConfigHubCard.vue'
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

withDefaults(defineProps<{
  /** 嵌在「配置迁移」页内时不渲染独立 SettingsPageShell */
  embedded?: boolean
}>(), {embedded: false})

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
const webdavDraft = reactive<CloudSyncWebDavSettings>({
  baseUrl: '',
  username: '',
  password: '',
  hasPassword: false,
  remotePath: 'datawise/profile-sync.dwprofile',
})

const exportOpen = ref(false)
const importOpen = ref(false)
const webdavOpen = ref(false)
const exportError = ref('')
const importError = ref('')
const webdavError = ref('')

const importFile = ref<File | null>(null)
const preflight = ref<ProfilePreflightResult | null>(null)
const busy = ref(false)
const fileInputRef = ref<HTMLInputElement>()

const hasDomain = (domains: ProfileDomainOptions) =>
    domains.connections || domains.app || domains.snippets
        || domains.aiWorkspace || domains.projects
        || domains.savedConsoles || domains.sqlHistory

const canPackage = computed(() => !readOnly.value && hasDomain(syncDomains))

const canWebDav = computed(
    () => canPackage.value && webdav.baseUrl.trim().length > 0,
)

const webdavConfigured = computed(() => webdav.baseUrl.trim().length > 0)

const webdavCardMeta = computed(() => {
  if (!webdavConfigured.value) return t('settings.configCloudSync.webdavNotConfigured')
  return webdav.baseUrl.trim()
})

const webdavConnectionHint = computed(() => {
  if (!webdavConfigured.value) return t('settings.configCloudSync.webdavNotConfigured')
  const user = webdav.username.trim() || '—'
  const path = webdav.remotePath.trim() || '—'
  return t('settings.configCloudSync.webdavConfiguredHint', {user, path})
})

const canApply = computed(
    () => !readOnly.value
        && !!importFile.value
        && hasDomain(syncDomains)
        && !!preflight.value?.schemaCompatible
        && (preflight.value.passphraseOk || preflight.value.manifest?.secretMode === 'omitted'),
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

function openWebDav() {
  if (denyIfReadOnly()) return
  webdavDraft.baseUrl = webdav.baseUrl
  webdavDraft.username = webdav.username
  webdavDraft.password = ''
  webdavDraft.hasPassword = webdav.hasPassword
  webdavDraft.remotePath = webdav.remotePath
  webdavError.value = ''
  webdavOpen.value = true
}

function closeWebDav() {
  webdavOpen.value = false
  webdavError.value = ''
  webdavDraft.password = ''
}

async function onDownloadPackage() {
  if (denyIfReadOnly() || !canPackage.value) return
  exportError.value = ''
  busy.value = true
  try {
    const {blob, fileName} = await exportProfilePackage({
      domains: {...syncDomains},
      includeSecrets: false,
    })
    downloadBlob(blob, fileName.startsWith('datawise-') ? fileName.replace('profile', 'sync') : fileName)
    closeExport()
    toast.notify({
      category: 'export',
      titleKey: 'exportDone',
      bodyKey: 'exportDone',
      params: {name: t('settings.configCloudSync.packageDownloaded')},
    })
  } catch (err) {
    exportError.value = resolveDisplayApiErrorMessage(err, (key) => String(t(key)))
        || t('settings.configCloudSync.packageFailed')
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
  if (denyIfReadOnly() || !importFile.value) return
  importError.value = ''
  busy.value = true
  try {
    const result = await preflightProfilePackage(importFile.value, '')
    preflight.value = result
    if (!result.schemaCompatible) {
      importError.value = t('settings.configPortability.schemaUnsupported')
      return
    }
    if (!result.passphraseOk && result.manifest?.secretMode !== 'omitted') {
      importError.value = t('settings.configPortability.passphraseIncorrect')
    }
  } catch (err) {
    importError.value = resolveDisplayApiErrorMessage(err, (key) => String(t(key)))
        || t('settings.configPortability.preflightFailed')
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
  if (denyIfReadOnly() || !canApply.value || !importFile.value) return
  importError.value = ''
  busy.value = true
  try {
    const result = await importProfilePackage(importFile.value, '', {...syncDomains})
    await refreshAfterImport()
    closeImport()
    closeWebDav()
    toast.notify({
      category: 'workspace',
      titleKey: 'importDone',
      bodyKey: 'importDone',
      params: {name: t('settings.configCloudSync.applySuccess')},
    })
    if (result.restartRecommended) {
      toast.warning(t('settings.configPortability.restartRecommended'))
    }
    importFile.value = null
    preflight.value = null
  } catch (err) {
    importError.value = resolveDisplayApiErrorMessage(err, (key) => String(t(key)))
        || t('settings.configCloudSync.applyFailed')
  } finally {
    busy.value = false
  }
}

async function onSaveWebDav() {
  if (denyIfReadOnly()) return
  webdavError.value = ''
  if (!webdavDraft.baseUrl.trim()) {
    webdavError.value = t('settings.configCloudSync.webdavUrlRequired')
    return
  }
  busy.value = true
  try {
    const saved = await saveCloudSyncSettings({...webdavDraft})
    webdav.baseUrl = saved.baseUrl
    webdav.username = saved.username
    webdav.hasPassword = saved.hasPassword
    webdav.remotePath = saved.remotePath
    webdav.password = ''
    webdavDraft.hasPassword = saved.hasPassword
    webdavDraft.password = ''
  } catch (err) {
    webdavError.value = resolveDisplayApiErrorMessage(err, (key) => String(t(key)))
        || t('settings.configCloudSync.webdavSaveFailed')
  } finally {
    busy.value = false
  }
}

async function onTestWebDav() {
  if (denyIfReadOnly() || !webdavDraft.baseUrl.trim()) return
  webdavError.value = ''
  busy.value = true
  try {
    await testCloudSyncWebDav({
      baseUrl: webdavDraft.baseUrl,
      username: webdavDraft.username,
      password: webdavDraft.password,
      remotePath: webdavDraft.remotePath,
      hasPassword: webdavDraft.hasPassword || webdav.hasPassword,
    })
  } catch (err) {
    webdavError.value = resolveDisplayApiErrorMessage(err, (key) => String(t(key)))
        || t('settings.configCloudSync.webdavTestFailed')
  } finally {
    busy.value = false
  }
}

async function onUploadWebDav() {
  if (denyIfReadOnly() || !canWebDav.value) return
  webdavError.value = ''
  busy.value = true
  try {
    await uploadCloudSyncWebDav({...syncDomains}, {
      baseUrl: webdav.baseUrl,
      username: webdav.username,
      password: webdavDraft.password || webdav.password,
      remotePath: webdav.remotePath,
      hasPassword: webdav.hasPassword,
    }, false)
  } catch (err) {
    webdavError.value = resolveDisplayApiErrorMessage(err, (key) => String(t(key)))
        || t('settings.configCloudSync.webdavUploadFailed')
  } finally {
    busy.value = false
  }
}

async function onDownloadWebDav() {
  if (denyIfReadOnly() || !webdav.baseUrl.trim()) return
  webdavError.value = ''
  importError.value = ''
  busy.value = true
  try {
    const {blob, fileName} = await downloadCloudSyncWebDav({
      baseUrl: webdav.baseUrl,
      username: webdav.username,
      password: webdavDraft.password || webdav.password,
      remotePath: webdav.remotePath,
      hasPassword: webdav.hasPassword,
    })
    const file = new File([blob], fileName, {type: 'application/octet-stream'})
    importFile.value = file
    const result = await preflightProfilePackage(file, '')
    preflight.value = result
    if (!result.schemaCompatible) {
      webdavError.value = t('settings.configPortability.schemaUnsupported')
      return
    }
    if (!result.passphraseOk && result.manifest?.secretMode !== 'omitted') {
      webdavError.value = t('settings.configPortability.passphraseIncorrect')
    }
  } catch (err) {
    webdavError.value = resolveDisplayApiErrorMessage(err, (key) => String(t(key)))
        || t('settings.configCloudSync.webdavDownloadFailed')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <component
      :is="embedded ? 'div' : SettingsPageShell"
      v-bind="embedded
        ? {class: 'config-hub-embed'}
        : {
          id: 'settings-config-cloud-sync',
          title: t('settings.configCloudSync.title'),
          subtitle: t('settings.configCloudSync.subtitle'),
        }"
  >
    <section class="config-hub-group">
      <header v-if="embedded" class="config-hub-group__head">
        <h3 class="config-hub-group__title">{{ t('settings.configCloudSync.hubGroupTitle') }}</h3>
        <p class="config-hub-group__hint">{{ t('settings.configCloudSync.hubGroupHint') }}</p>
      </header>
      <div class="config-hub">
        <ConfigHubCard
            :title="t('settings.configCloudSync.exportPackage')"
            :hint="t('settings.configCloudSync.exportPackageHint')"
            icon="export"
            :action-label="t('settings.configCloudSync.hubOpen')"
            :disabled="readOnly"
            @click="openExport"
        />
        <ConfigHubCard
            :title="t('settings.configCloudSync.importPackage')"
            :hint="t('settings.configCloudSync.importPackageHint')"
            icon="import"
            :action-label="t('settings.configCloudSync.hubOpen')"
            :disabled="readOnly"
            @click="openImport"
        />
        <ConfigHubCard
            :title="t('settings.configCloudSync.webdavTitle')"
            :hint="t('settings.configCloudSync.webdavHint')"
            :meta="webdavCardMeta"
            icon="link"
            :action-label="webdavConfigured
              ? t('settings.configCloudSync.hubManage')
              : t('settings.configCloudSync.configureWebdav')"
            :disabled="readOnly"
            @click="openWebDav"
        />
      </div>
    </section>
  </component>

  <input
      ref="fileInputRef"
      class="config-file-input"
      type="file"
      accept=".dwprofile,application/zip"
      @change="onFileChosen"
  >

  <AppModal
      :open="exportOpen"
      :title="t('settings.configCloudSync.exportModalTitle')"
      :subtitle="t('settings.configCloudSync.exportModalSubtitle')"
      width="560px"
      @close="closeExport"
  >
    <form class="modal-form modal-form--compact" @submit.prevent="onDownloadPackage">
      <div class="config-modal-section">
        <p class="config-modal-label">{{ t('settings.configCloudSync.domainsTitle') }}</p>
        <ProfileDomainPicker
            v-model="syncDomains"
            :aria-label="t('settings.configCloudSync.domainsTitle')"
            :disabled="readOnly"
        />
        <p class="config-modal-hint">{{ t('settings.configCloudSync.credentialsDefault') }}</p>
      </div>
      <DwInlineAlert v-if="exportError" :message="exportError" density="banner"/>
    </form>
    <template #footer>
      <ModalActions
          :confirm-label="t('settings.configCloudSync.downloadPackage')"
          :confirm-disabled="!canPackage || busy"
          :confirm-loading="busy"
          @cancel="closeExport"
          @confirm="onDownloadPackage"
      />
    </template>
  </AppModal>

  <AppModal
      :open="importOpen"
      :title="t('settings.configCloudSync.importModalTitle')"
      :subtitle="t('settings.configCloudSync.importModalSubtitle')"
      width="560px"
      @close="closeImport"
  >
    <form class="modal-form modal-form--compact" @submit.prevent="onApply">
      <FormField
          :label="t('settings.configPortability.chooseFile')"
          :hint="importFile?.name || t('settings.configPortability.noFile')"
      >
        <DwButton variant="secondary" size="sm" :disabled="busy || readOnly" @click="pickImportFile">
          {{ t('settings.configPortability.chooseFile') }}
        </DwButton>
      </FormField>
      <div class="config-modal-section">
        <p class="config-modal-label">{{ t('settings.configCloudSync.domainsTitle') }}</p>
        <ProfileDomainPicker
            v-model="syncDomains"
            :aria-label="t('settings.configCloudSync.domainsTitle')"
            :disabled="readOnly"
        />
        <p class="config-modal-hint">{{ t('settings.configCloudSync.domainsHint') }}</p>
      </div>
      <div v-if="preflight" class="config-preflight">
        <p>{{ t('settings.configCloudSync.preflightSummary', {
          secretMode: preflight.manifest?.secretMode || '—',
          connections: Number(preflight.counts?.connections ?? 0),
        }) }}</p>
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
            :disabled="busy || readOnly || !importFile"
            @click="onPreflight"
        >
          {{ t('settings.configPortability.preflightAction') }}
        </DwButton>
        <DwButton
            variant="primary"
            type="button"
            :loading="busy"
            :disabled="!canApply || busy"
            @click="onApply"
        >
          {{ t('settings.configCloudSync.applyPackage') }}
        </DwButton>
      </SettingsActions>
    </template>
  </AppModal>

  <AppModal
      :open="webdavOpen"
      :title="t('settings.configCloudSync.webdavEditorTitle')"
      :subtitle="t('settings.configCloudSync.webdavEditorSubtitle')"
      width="600px"
      @close="closeWebDav"
  >
    <form class="modal-form modal-form--compact" @submit.prevent="onSaveWebDav">
      <div class="config-modal-section">
        <p class="config-modal-label">{{ t('settings.configCloudSync.webdavConnection') }}</p>
        <p v-if="webdavConfigured" class="config-modal-hint config-modal-hint--mono">
          {{ webdavConnectionHint }}
        </p>
        <FormField :label="t('settings.configCloudSync.baseUrl')">
          <DwInput
              v-model="webdavDraft.baseUrl"
              autocomplete="off"
              placeholder="https://nas.example/webdav"
          />
        </FormField>
        <div class="modal-form-grid">
          <FormField :label="t('settings.configCloudSync.username')">
            <DwInput v-model="webdavDraft.username" autocomplete="username"/>
          </FormField>
          <FormField
              :label="t('settings.configCloudSync.password')"
              :hint="webdavDraft.hasPassword ? t('settings.configCloudSync.passwordKept') : undefined"
          >
            <DwInput
                v-model="webdavDraft.password"
                type="password"
                autocomplete="current-password"
                :placeholder="webdavDraft.hasPassword ? t('settings.configCloudSync.passwordKept') : ''"
            />
          </FormField>
        </div>
        <FormField :label="t('settings.configCloudSync.remotePath')">
          <DwInput v-model="webdavDraft.remotePath" variant="mono" autocomplete="off"/>
        </FormField>
        <SettingsActions>
          <DwButton
              variant="primary"
              size="sm"
              type="button"
              :loading="busy"
              :disabled="busy || readOnly"
              @click="onSaveWebDav"
          >
            {{ t('settings.configCloudSync.saveWebdav') }}
          </DwButton>
          <DwButton
              variant="secondary"
              size="sm"
              type="button"
              :loading="busy"
              :disabled="busy || readOnly || !webdavDraft.baseUrl.trim()"
              @click="onTestWebDav"
          >
            {{ t('settings.configCloudSync.testWebdav') }}
          </DwButton>
        </SettingsActions>
      </div>

      <div class="config-modal-section">
        <p class="config-modal-label">{{ t('settings.configCloudSync.domainsTitle') }}</p>
        <ProfileDomainPicker
            v-model="syncDomains"
            :aria-label="t('settings.configCloudSync.domainsTitle')"
            :disabled="readOnly"
        />
        <p class="config-modal-hint">{{ t('settings.configCloudSync.webdavActionsHint') }}</p>
        <SettingsActions>
          <DwButton
              variant="secondary"
              size="sm"
              type="button"
              :loading="busy"
              :disabled="!canWebDav || busy"
              @click="onUploadWebDav"
          >
            {{ t('settings.configCloudSync.uploadWebdav') }}
          </DwButton>
          <DwButton
              variant="secondary"
              size="sm"
              type="button"
              :loading="busy"
              :disabled="busy || readOnly || !webdavConfigured"
              @click="onDownloadWebDav"
          >
            {{ t('settings.configCloudSync.downloadWebdav') }}
          </DwButton>
        </SettingsActions>
      </div>

      <div v-if="preflight && importFile" class="config-preflight">
        <p>{{ t('settings.configCloudSync.preflightSummary', {
          secretMode: preflight.manifest?.secretMode || '—',
          connections: Number(preflight.counts?.connections ?? 0),
        }) }}</p>
        <p class="config-modal-hint">{{ importFile.name }}</p>
      </div>

      <DwInlineAlert v-if="webdavError" :message="webdavError" density="banner"/>
    </form>

    <template #footer>
      <SettingsActions>
        <DwButton variant="ghost" type="button" @click="closeWebDav">
          {{ t('common.cancel') }}
        </DwButton>
        <DwButton
            v-if="preflight && importFile"
            variant="primary"
            type="button"
            :loading="busy"
            :disabled="!canApply || busy"
            @click="onApply"
        >
          {{ t('settings.configCloudSync.applyPackage') }}
        </DwButton>
      </SettingsActions>
    </template>
  </AppModal>
</template>

<style scoped>
.config-hub-embed,
.config-hub-group {
  display: grid;
  gap: var(--dw-space-3);
  max-width: 48rem;
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
  max-width: 48rem;
}

.config-hub > :last-child:nth-child(odd) {
  grid-column: 1 / -1;
}

.config-file-input {
  display: none;
}

.config-modal-section {
  display: grid;
  gap: var(--dw-space-3);
}

.config-modal-label {
  margin: 0;
  font-size: var(--dw-text-xs);
  font-weight: 600;
  color: var(--dw-text-secondary);
}

.config-modal-hint {
  margin: 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  line-height: var(--dw-leading-relaxed);
}

.config-modal-hint--mono {
  font-family: var(--dw-mono);
}

.config-preflight {
  display: grid;
  gap: var(--dw-space-2);
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

@media (max-width: 640px) {
  .config-hub {
    grid-template-columns: 1fr;
  }

  .config-hub > :last-child:nth-child(odd) {
    grid-column: auto;
  }
}
</style>
