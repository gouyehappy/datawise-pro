<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {AppModal, DwButton, ProgressBar} from '@/core/components'
import {UserResource} from '@/features/auth/types/user-resource.types'
import {useResourceWriteGuard} from '@/features/auth/composables/useResourceWriteGuard'
import SettingsSwitch from '@/core/components/SettingsSwitch.vue'
import AppBrandLogo from '@/features/layout/components/AppBrandLogo.vue'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import SettingsGroup from '@/features/settings/components/SettingsGroup.vue'
import {
  APP_VERSION,
  formatUpdateBytes,
} from '@/features/settings/services/about-settings.service'
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

const last = computed(() => updateSettings.lastCheck)
const canInstall = computed(() => Boolean(last.value?.downloadReady))
const canDownload = computed(() =>
  Boolean(
    desktopApp
    && last.value?.hasUpdate
    && !last.value?.downloadReady
    && !updateSettings.downloading,
  ),
)

const isIncremental = computed(() => last.value?.updateChannel === 'incremental')
const downloadSizeLabel = computed(() => formatUpdateBytes(last.value?.downloadBytes))
const savedSizeLabel = computed(() => formatUpdateBytes(last.value?.savedBytes))
const fullSizeLabel = computed(() => formatUpdateBytes(last.value?.fullPackageBytes))

const planHeadline = computed(() => {
  if (!last.value?.hasUpdate) return ''
  if (isIncremental.value && downloadSizeLabel.value) {
    if (savedSizeLabel.value) {
      return t('settings.about.planIncrementalSaved', {
        download: downloadSizeLabel.value,
        saved: savedSizeLabel.value,
      })
    }
    return t('settings.about.planIncremental', {download: downloadSizeLabel.value})
  }
  if (fullSizeLabel.value) {
    return t('settings.about.planFull', {download: fullSizeLabel.value})
  }
  return last.value?.updateSummary || ''
})

const kindChips = computed(() => {
  const kinds = last.value?.updateKinds
  if (!kinds?.length) return []
  return kinds.map((kind) => {
    if (kind === 'frontend-dist') return t('settings.about.kindFrontend')
    if (kind === 'server-jar') return t('settings.about.kindServer')
    if (kind === 'installer' || kind === 'portable-zip') return t('settings.about.kindInstaller')
    return kind
  })
})

const downloadButtonLabel = computed(() => {
  if (updateSettings.downloading) {
    return t('settings.about.downloadingShort', {
      percent: Math.round(updateSettings.downloadPercent),
    })
  }
  if (isIncremental.value && downloadSizeLabel.value) {
    return t('settings.about.downloadIncremental', {size: downloadSizeLabel.value})
  }
  if (fullSizeLabel.value) {
    return t('settings.about.downloadFull', {size: fullSizeLabel.value})
  }
  return t('settings.about.downloadUpdate')
})

const installButtonLabel = computed(() => {
  const action = last.value?.installAction
  if (action === 'reload') return t('settings.about.applyAndReload')
  if (action === 'restart') return t('settings.about.applyAndRestart')
  if (action === 'installer') return t('settings.about.openInstaller')
  return t('settings.about.installAndRestart')
})

const progressKindLabel = computed(() => {
  const kind = updateSettings.activeKind
  if (!kind) return ''
  if (kind === 'frontend-dist') return t('settings.about.kindFrontend')
  if (kind === 'server-jar') return t('settings.about.kindServer')
  if (kind === 'installer' || kind === 'portable-zip') return t('settings.about.kindInstaller')
  return kind
})

const releaseNotesPreview = computed(() => {
  const notes = last.value?.releaseNotes?.trim()
  if (!notes) return ''
  return notes.length > 480 ? `${notes.slice(0, 480)}…` : notes
})

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
  // Manual button: always hit the network (unlimited). Auto/startup stays hourly-throttled.
  const result = await updateSettings.runUpdateCheck({force: true})
  if (result.error) {
    layout.showErrorToast(t('settings.about.updateCheckFailed', {message: result.error}))
    return
  }
  if (result.downloadReady) {
    layout.showToast(t('settings.about.updateReady', {version: result.latestVersion}))
    return
  }
  if (result.hasUpdate) {
    const size = formatUpdateBytes(result.downloadBytes)
    layout.notifyQuiet({
      category: 'system',
      titleKey: 'updateAvailable',
      bodyKey: size ? 'updateAvailableIncremental' : 'updateAvailable',
      params: {
        version: result.latestVersion || '',
        size: size || '',
        saved: formatUpdateBytes(result.savedBytes) || '',
      },
    })
    if (updateSettings.preferences.autoDownload) {
      await handleDownload()
    }
    return
  }
  // 已是最新：页面状态已足够，不弹 toast。
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
  const result = await updateSettings.runInstall()
  if (!result.ok) {
    layout.showErrorToast(t('settings.about.installFailed'))
    return
  }
  if (!result.restartRequired) {
    layout.showToast(t('settings.about.appliedHotReload', {
      version: last.value?.latestVersion || APP_VERSION,
    }))
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
              {{ t('settings.about.latestVersion', {version: last?.latestVersion ?? APP_VERSION}) }}
            </p>
          </div>
        </div>

        <div
            v-if="desktopApp && last?.hasUpdate"
            class="update-plan"
            :data-channel="last.updateChannel || 'none'"
        >
          <div class="update-plan__badge">
            {{
              isIncremental
                ? t('settings.about.channelIncremental')
                : t('settings.about.channelFull')
            }}
          </div>
          <p v-if="planHeadline" class="update-plan__headline">{{ planHeadline }}</p>
          <div v-if="kindChips.length" class="update-plan__chips">
            <span v-for="chip in kindChips" :key="chip" class="update-chip">{{ chip }}</span>
          </div>
          <p v-if="isIncremental" class="update-plan__hint">
            {{ t('settings.about.incrementalHint') }}
          </p>
        </div>

        <div v-if="updateSettings.downloading" class="update-progress">
          <div class="update-progress__meta">
            <span>{{ progressKindLabel || t('settings.about.downloadingLabel') }}</span>
            <span>{{ Math.round(updateSettings.downloadPercent) }}%</span>
          </div>
          <ProgressBar :value="updateSettings.downloadPercent"/>
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
            {{ downloadButtonLabel }}
          </DwButton>
          <DwButton
              v-if="canInstall"
              variant="primary"
              @click="handleInstall"
          >
            {{ installButtonLabel }}
          </DwButton>
          <DwButton variant="secondary" @click="showChangelog = true">
            {{ t('settings.about.changelog') }}
          </DwButton>
        </div>

        <details v-if="releaseNotesPreview" class="release-notes">
          <summary>{{ t('settings.about.releaseNotes') }}</summary>
          <pre class="release-notes__body">{{ releaseNotesPreview }}</pre>
        </details>
      </section>

      <SettingsGroup
          :title="t('settings.about.softwareUpdate')"
          :hint="t('settings.about.intro')"
      >
        <SettingsSwitch
            :model-value="updateSettings.preferences.notifyOnUpdate"
            :label="t('settings.about.notifyOnUpdate')"
            :hint="t('settings.about.autoUpdateDesc')"
            :disabled="readOnly"
            @update:model-value="patchUpdatePrefs({ notifyOnUpdate: $event })"
        />
        <SettingsSwitch
            :model-value="updateSettings.preferences.autoDownload"
            :label="t('settings.about.autoDownload')"
            :hint="t('settings.about.networkDesc')"
            :disabled="readOnly"
            @update:model-value="patchUpdatePrefs({ autoDownload: $event })"
        />
      </SettingsGroup>
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

<style scoped>
.update-plan {
  margin-top: var(--dw-space-4);
  padding: var(--dw-space-4);
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-surface);
}

.update-plan[data-channel='incremental'] {
  border-color: color-mix(in srgb, var(--dw-success) 45%, var(--dw-border));
  background: color-mix(in srgb, var(--dw-success) 8%, var(--dw-surface));
}

.update-plan__badge {
  display: inline-flex;
  align-items: center;
  min-height: var(--dw-density-xs);
  padding: 0 var(--dw-space-3);
  border-radius: var(--dw-control-radius-sm);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  color: var(--dw-success);
  background: color-mix(in srgb, var(--dw-success) 14%, transparent);
}

.update-plan[data-channel='full'] .update-plan__badge {
  color: var(--dw-warning);
  background: color-mix(in srgb, var(--dw-warning) 14%, transparent);
}

.update-plan__headline {
  margin: var(--dw-space-3) 0 0;
  font-size: var(--dw-text-sm);
  color: var(--dw-text);
}

.update-plan__hint {
  margin: var(--dw-space-2) 0 0;
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.update-plan__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-space-2);
  margin-top: var(--dw-space-3);
}

.update-chip {
  display: inline-flex;
  align-items: center;
  min-height: var(--dw-density-xs);
  padding: 0 var(--dw-space-3);
  border-radius: var(--dw-control-radius-sm);
  font-size: var(--dw-text-xs);
  color: var(--dw-text);
  background: var(--dw-surface-muted);
  border: 1px solid var(--dw-border);
}

.update-progress {
  margin-top: var(--dw-space-4);
  display: grid;
  gap: var(--dw-space-2);
}

.update-progress__meta {
  display: flex;
  justify-content: space-between;
  gap: var(--dw-space-3);
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.release-notes {
  margin-top: var(--dw-space-4);
  font-size: var(--dw-text-sm);
}

.release-notes summary {
  cursor: pointer;
  color: var(--dw-text-muted);
}

.release-notes__body {
  margin: var(--dw-space-3) 0 0;
  padding: var(--dw-space-3);
  max-height: 12rem;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--dw-mono);
  font-size: var(--dw-text-xs);
  border-radius: var(--dw-control-radius);
  background: var(--dw-surface-muted);
  border: 1px solid var(--dw-border);
}
</style>
