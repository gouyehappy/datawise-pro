<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, DwButton} from '@/core/components'
import {UserResource} from '@/features/auth/types/user-resource.types'
import {useResourceWriteGuard} from '@/features/auth/composables/useResourceWriteGuard'
import SettingsSwitch from '@/core/components/SettingsSwitch.vue'
import AppBrandLogo from '@/features/layout/components/AppBrandLogo.vue'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import {APP_VERSION} from '@/features/settings/services/about-settings.service'
import {fetchRuntimeOverview} from '@/features/settings/services/runtime-settings.service'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useUpdateSettingsStore} from '@/features/settings/stores/update-settings'
import {desktopPlatform, isDesktopApp} from '@/features/layout/services/desktop-chrome'

const {t, tm} = useI18n()
const layout = useLayoutStore()
const updateSettings = useUpdateSettingsStore()
const {readOnly, hint, denyIfReadOnly} = useResourceWriteGuard(UserResource.UpdatePreferences)
const showChangelog = ref(false)
const desktopApp = isDesktopApp()
const packagingProfile = ref<string | null>(null)
const platformLabel = computed(() => {
  const platform = desktopPlatform()
  if (!desktopApp || !platform) return ''
  if (platform === 'darwin') return t('settings.about.desktopPlatform.mac')
  if (platform === 'linux') return t('settings.about.desktopPlatform.linux')
  if (platform === 'win32') return t('settings.about.desktopPlatform.windows')
  return t('settings.about.desktopPlatform.other', {platform})
})

const changelogItems = tm('settings.about.changelogItems') as {
  version: string
  date: string
  notes: string
}[]

const canInstall = computed(() => Boolean(updateSettings.lastCheck?.downloadReady))
const canDownload = computed(() =>
  Boolean(
    desktopApp
    && updateSettings.lastCheck?.hasUpdate
    && !updateSettings.lastCheck?.downloadReady
    && !updateSettings.downloading,
  ),
)

onMounted(() => {
  updateSettings.ensureStatusSubscription()
  void fetchRuntimeOverview()
    .then((overview) => {
      packagingProfile.value = overview.packaging?.profile?.trim() || null
    })
    .catch(() => {
      packagingProfile.value = null
    })
})

async function handleCheckUpdate() {
  const result = await updateSettings.runUpdateCheck()
  if (result.error) {
    layout.showErrorToast(t('settings.about.updateCheckFailed', {message: result.error}))
    return
  }
  if (result.downloadReady) {
    layout.showToast(t('settings.about.updateReady', {version: result.latestVersion}))
    return
  }
  if (result.hasUpdate) {
    layout.showToast(t('settings.about.updateAvailable', {version: result.latestVersion}))
    if (updateSettings.preferences.autoDownload) {
      await handleDownload()
    }
    return
  }
  layout.showSuccessToast(t('settings.about.upToDate'))
}

async function handleDownload() {
  const result = await updateSettings.runDownload()
  if (result.error) {
    layout.showErrorToast(t('settings.about.downloadFailed', {message: result.error}))
    return
  }
  if (result.downloadReady) {
    layout.showToast(t('settings.about.updateReady', {version: result.latestVersion}))
  }
}

async function handleInstall() {
  const ok = await updateSettings.runInstall()
  if (!ok) {
    layout.showErrorToast(t('settings.about.installFailed'))
  }
}

function patchUpdatePrefs(patch: Partial<typeof updateSettings.preferences>) {
  if (denyIfReadOnly()) return
  updateSettings.patchPreferences(patch)
}
</script>

<template>
  <SettingsPageShell
      :title="t('settings.about.title')"
      :subtitle="t('settings.about.subtitle')"
      :readonly="readOnly"
      :readonly-hint="hint"
  >
    <div class="settings-groups">
      <section class="about-card">
        <div class="about-brand">
          <AppBrandLogo size="lg"/>
          <div>
            <h3>{{ t('settings.about.versionLabel', {version: APP_VERSION}) }}</h3>
            <p v-if="platformLabel" class="latest-line">{{ platformLabel }}</p>
            <p v-if="packagingProfile" class="latest-line">
              {{ t('settings.about.installProfile', {profile: packagingProfile}) }}
            </p>
            <p class="latest-line">
              {{ t('settings.about.latestVersion', {version: updateSettings.lastCheck?.latestVersion ?? APP_VERSION}) }}
            </p>
            <p v-if="updateSettings.downloading" class="latest-line">
              {{ t('settings.about.downloading', {percent: updateSettings.downloadPercent}) }}
            </p>
          </div>
        </div>

        <div class="about-actions">
          <DwButton
              variant="primary"
              :loading="updateSettings.checking"
              :disabled="updateSettings.checking || updateSettings.downloading"
              @click="handleCheckUpdate"
          >
            {{ updateSettings.checking ? t('settings.about.checking') : t('settings.about.checkUpdate') }}
          </DwButton>
          <DwButton
              v-if="canDownload"
              variant="secondary"
              :loading="updateSettings.downloading"
              :disabled="updateSettings.downloading"
              @click="handleDownload"
          >
            {{ t('settings.about.downloadUpdate') }}
          </DwButton>
          <DwButton
              v-if="canInstall"
              variant="primary"
              @click="handleInstall"
          >
            {{ t('settings.about.installAndRestart') }}
          </DwButton>
          <DwButton variant="secondary" @click="showChangelog = true">
            {{ t('settings.about.changelog') }}
          </DwButton>
        </div>
      </section>

      <section class="setting-block update-section">
        <h3>{{ t('settings.about.softwareUpdate') }}</h3>
        <p class="update-intro">{{ t('settings.about.intro') }}</p>

        <div class="update-block">
          <h4>{{ t('settings.about.autoUpdateTitle') }}</h4>
          <p>{{ t('settings.about.autoUpdateDesc') }}</p>
        </div>

        <div class="update-block">
          <h4>{{ t('settings.about.networkTitle') }}</h4>
          <p>{{ t('settings.about.networkDesc') }}</p>
        </div>

        <div class="update-options">
          <SettingsSwitch
              :model-value="updateSettings.preferences.notifyOnUpdate"
              :label="t('settings.about.notifyOnUpdate')"
              :disabled="readOnly"
              @update:model-value="patchUpdatePrefs({ notifyOnUpdate: $event })"
          />
          <SettingsSwitch
              :model-value="updateSettings.preferences.autoDownload"
              :label="t('settings.about.autoDownload')"
              :disabled="readOnly"
              @update:model-value="patchUpdatePrefs({ autoDownload: $event })"
          />
        </div>
      </section>
    </div>

    <AppModal
        :open="showChangelog"
        :title="t('settings.about.changelogTitle')"
        width="480px"
        @close="showChangelog = false"
    >
      <ul class="modal-changelog-list">
        <li v-for="item in changelogItems" :key="item.version">
          <div class="modal-changelog-head">
            <strong>v{{ item.version }}</strong>
            <time>{{ item.date }}</time>
          </div>
          <p>{{ item.notes }}</p>
        </li>
      </ul>
    </AppModal>
  </SettingsPageShell>
</template>
