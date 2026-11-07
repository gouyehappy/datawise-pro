<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {currentLocale, setLocale, type AppLocale} from '@/i18n'
import {
    BACKGROUND_PRESETS_DARK,
    BACKGROUND_PRESETS_LIGHT,
    PRIMARY_PRESETS,
    UI_DENSITY_IDS,
    UI_FONT_IDS,
    UI_FONT_SIZE_PX_MAX,
    UI_FONT_SIZE_PX_MIN,
    UI_FONT_SIZE_PX_STEP,
    UI_TEXT_SCALE_IDS,
    clampUiFontSizePx,
    resolveUiFontPreviewFamily,
    type BackgroundTone,
    type PrimaryTone,
    type ThemeAppearance,
    type UiDensityId,
    type UiFontId,
    type UiTextScaleId,
} from '@/features/settings/constants/theme-presets'
import {UI_SKIN_DEFINITIONS} from '@/core/ui-skin'
import {UserResource} from '@/features/auth/types/user-resource.types'
import {useResourceWriteGuard} from '@/features/auth/composables/useResourceWriteGuard'
import ThemeAppearanceCard from '@/features/settings/components/ThemeAppearanceCard.vue'
import ThemeSkinCard from '@/features/settings/components/ThemeSkinCard.vue'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import SettingsSectionCard from '@/features/settings/components/SettingsSectionCard.vue'
import SettingsSegmentTabs from '@/features/settings/components/SettingsSegmentTabs.vue'
import LayoutToggleChip from '@/features/settings/components/LayoutToggleChip.vue'
import {useThemeStore} from '@/features/settings/stores/theme-store'
import {DwButton, DwInput, FormField, ConfirmDialog, DwInlineAlert, DwActionFeedback} from '@/core/components'
import SettingsSelect from '@/core/components/SettingsSelect.vue'
import {DwIcon} from '@/core/icons'
import IconButton from '@/core/components/IconButton.vue'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {settingsApi} from '@/api/modules/settings'
import {
    applyConfigDirectoryAndRestart,
    loadConfigDirSettings,
    pickConfigDirectory,
    resolveConfigDirectoryPath,
} from '@/features/settings/services/config-dir-settings.service'
import {
    exportConfigSnapshot,
    importConfigSnapshotText,
    pickConfigSnapshotFile,
} from '@/features/settings/services/config-snapshot-io.service'
import {useShortcutPanelStore} from '@/features/layout/stores/shortcut-panel-store'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {DATA_DIRECTORY_SUBDIRS} from '@/shared/config/data-directory-layout'
import {isDesktopApp} from '@/features/layout/services/desktop-chrome'
import {buildDeepLinkExample} from '@/shared/deep-link/deep-link.service'
import {
    loadApiServerPreferences,
    normalizeApiServerUrl,
    saveApiServerPreferences,
    type ApiServerMode,
} from '@/shared/api/api-server-prefs'
import {resolveLocalApiBaseUrlLabel} from '@/shared/api/mode'

const {t} = useI18n()
const theme = useThemeStore()
const layout = useLayoutStore()
const appConfig = useAppConfigStore()
const auth = useAuthStore()
const explorer = useExplorerStore()
const shortcutPanel = useShortcutPanelStore()
const desktopApp = isDesktopApp()

type BasicTabId = 'appearance' | 'connection' | 'data'
const basicTab = ref<BasicTabId>('appearance')
const basicTabs = computed(() => [
  {id: 'appearance' as const, label: t('settings.basic.appearanceGroup')},
  {id: 'connection' as const, label: t('settings.basic.connectionGroup')},
  {id: 'data' as const, label: t('settings.basic.dataGroup')},
])

const openHttpLinksIn = computed(
    () => appConfig.preferences.openHttpLinksIn === 'system' ? 'system' : 'builtin',
)

function onOpenHttpLinksChange(value: string) {
  if (denyIfReadOnly()) return
  appConfig.setOpenHttpLinksIn(value === 'system' ? 'system' : 'builtin')
}
const deepLinkExample = buildDeepLinkExample()
const deepLinkCopied = ref(false)
let deepLinkCopiedTimer: ReturnType<typeof setTimeout> | null = null
const snapshotIncludePasswords = ref(false)
const snapshotBusy = ref(false)

const deepLinkParamDefs = [
  {key: 'connectionId', optional: false, descKey: 'settings.basic.deepLink.connectionId'},
  {key: 'database', optional: true, descKey: 'settings.basic.deepLink.database'},
  {key: 'sql', optional: true, descKey: 'settings.basic.deepLink.sql'},
] as const

const deepLinkExampleParams = computed(() => {
  const url = new URL(deepLinkExample)
  return (['connectionId', 'database', 'sql'] as const)
      .map((key) => ({key, value: url.searchParams.get(key) ?? ''}))
      .filter((entry) => entry.value)
})
const {readOnly, hint, denyIfReadOnly} = useResourceWriteGuard(UserResource.AppConfig)

const appearances: ThemeAppearance[] = ['light', 'dark', 'system']
const backgroundTones: BackgroundTone[] = ['default', 'warm', 'cool', 'slate']
const uiSkins = UI_SKIN_DEFINITIONS
const primaryTones: PrimaryTone[] = ['violet', 'blue', 'cyan', 'green', 'orange', 'rose']
const locales: AppLocale[] = ['zh-CN', 'en-US']

const backgroundTonePresets = computed(() =>
  theme.resolvedMode === 'dark' ? BACKGROUND_PRESETS_DARK : BACKGROUND_PRESETS_LIGHT,
)

function openConfigPortability() {
  layout.openSettingsModule('configPortability')
}

const uiFontOptions = computed(() =>
  UI_FONT_IDS.map((id) => ({
    value: id,
    label: t(`settings.basic.uiFonts.${id}`),
  })),
)

const uiTextScaleTabs = computed(() =>
  UI_TEXT_SCALE_IDS.map((id) => ({
    id,
    label: t(`settings.basic.uiTextScales.${id}`),
  })),
)

const uiDensityTabs = computed(() =>
  UI_DENSITY_IDS.map((id) => ({
    id,
    label: t(`settings.basic.uiDensities.${id}`),
  })),
)

const uiFontCustomDraft = ref(theme.uiFontCustom || '')
const uiFontSizeDraft = ref(String(theme.uiFontSizePx ?? 13.5))

watch(
  () => theme.uiFontCustom,
  (v) => {
    uiFontCustomDraft.value = v || ''
  },
)
watch(
  () => theme.uiFontSizePx,
  (v) => {
    uiFontSizeDraft.value = String(v ?? 13.5)
  },
)

function onUiFontChange(value: string) {
  if (denyIfReadOnly()) return
  theme.setUiFont(value as UiFontId)
}

function onUiFontCustomCommit() {
  if (denyIfReadOnly()) return
  theme.setUiFontCustom(uiFontCustomDraft.value)
}

function onUiTextScaleChange(value: string) {
  if (denyIfReadOnly()) return
  if (UI_TEXT_SCALE_IDS.includes(value as UiTextScaleId)) {
    theme.setUiTextScale(value as UiTextScaleId)
  }
}

function onUiFontSizeCommit() {
  if (denyIfReadOnly()) return
  const next = clampUiFontSizePx(uiFontSizeDraft.value)
  uiFontSizeDraft.value = String(next)
  theme.setUiFontSizePx(next)
}

function onUiDensityChange(value: string) {
  if (denyIfReadOnly()) return
  if (UI_DENSITY_IDS.includes(value as UiDensityId)) {
    theme.setUiDensity(value as UiDensityId)
  }
}

const configDirInput = ref('')
const previewPath = ref('')
const activeFromBackend = ref('')
const defaultPath = ref('')
const canChangeConfigDir = ref(false)
const configDirSaving = ref(false)
const configDirError = ref('')
const restartConfirmOpen = ref(false)

const workspacePathMismatch = computed(() => {
    const active = activeFromBackend.value.trim()
    const preview = previewPath.value.trim()
    if (!active || !preview) return false
    return active.replace(/[/\\]+$/, '').toLowerCase() !== preview.replace(/[/\\]+$/, '').toLowerCase()
})

const apiServerMode = ref<ApiServerMode>('local')
const apiServerRemoteUrl = ref('')
const apiServerSaving = ref(false)
const apiServerTesting = ref(false)
const apiServerError = ref('')
const apiServerTestMessage = ref<string | null>(null)
const apiServerTestOk = ref<boolean | null>(null)
const apiServerEndpointTick = ref(0)

const apiServerModeTabs = computed(() => [
    {id: 'local', label: t('settings.basic.apiServer.modes.local')},
    {id: 'remote', label: t('settings.basic.apiServer.modes.remote')},
])

const savedApiServerPrefs = computed(() => {
    apiServerEndpointTick.value
    return loadApiServerPreferences()
})

const localApiEndpointLabel = computed(() => {
    apiServerEndpointTick.value
    return resolveLocalApiBaseUrlLabel()
})

const draftRemoteNormalized = computed(() => normalizeApiServerUrl(apiServerRemoteUrl.value))

const apiServerDirty = computed(() => {
    const saved = savedApiServerPrefs.value
    if (apiServerMode.value !== saved.mode) return true
    if (apiServerMode.value === 'remote') {
        const draft = draftRemoteNormalized.value ?? apiServerRemoteUrl.value.trim().replace(/\/$/, '')
        return draft !== saved.remoteUrl
    }
    return false
})

const pendingEndpointLabel = computed(() => {
    if (!apiServerDirty.value) return null
    if (apiServerMode.value === 'local') return localApiEndpointLabel.value
    return draftRemoteNormalized.value
})

const apiServerStatusLabel = computed(() => {
    const saved = savedApiServerPrefs.value
    if (saved.mode === 'remote' && saved.remoteUrl) return saved.remoteUrl
    return localApiEndpointLabel.value
})

function refreshApiServerEndpointLabel() {
    apiServerEndpointTick.value += 1
}

function loadApiServerDraft() {
    const prefs = loadApiServerPreferences()
    apiServerMode.value = prefs.mode
    apiServerRemoteUrl.value = prefs.remoteUrl
    apiServerError.value = ''
    apiServerTestMessage.value = null
    apiServerTestOk.value = null
    refreshApiServerEndpointLabel()
}

function onApiServerModeChange(id: string) {
    apiServerMode.value = id === 'remote' ? 'remote' : 'local'
    apiServerError.value = ''
    apiServerTestMessage.value = null
    apiServerTestOk.value = null
}

function resolveLocalTestBaseUrl(): string {
    const label = resolveLocalApiBaseUrlLabel()
    if (label.endsWith('/api') && !label.includes('://')) return ''
    if (label.endsWith('/api')) return label.slice(0, -4)
    return label.startsWith('http') ? label : ''
}

async function testApiServer() {
    apiServerError.value = ''
    let target = ''
    if (apiServerMode.value === 'remote') {
        const normalized = normalizeApiServerUrl(apiServerRemoteUrl.value)
        if (!normalized) {
            apiServerError.value = t('settings.basic.apiServer.invalidUrl')
            return
        }
        target = normalized
    } else {
        target = resolveLocalTestBaseUrl()
    }

    apiServerTesting.value = true
    apiServerTestMessage.value = null
    apiServerTestOk.value = null
    try {
        const snapshot = await settingsApi.pingHealthAt(target)
        if (snapshot.result?.ok) {
            apiServerTestOk.value = true
            apiServerTestMessage.value = t('settings.basic.apiServer.testOk', {
                latency: snapshot.result.latencyMs,
            })
        } else {
            apiServerTestOk.value = false
            apiServerTestMessage.value = t('settings.basic.apiServer.testFailed')
        }
    } catch {
        apiServerTestOk.value = false
        apiServerTestMessage.value = t('settings.basic.apiServer.testFailed')
    } finally {
        apiServerTesting.value = false
    }
}

async function saveApiServer() {
    if (apiServerSaving.value) return
    if (!apiServerDirty.value) {
        layout.showToast(t('settings.basic.apiServer.unchanged'))
        return
    }

    let remoteUrl = apiServerRemoteUrl.value.trim().replace(/\/$/, '')
    if (apiServerMode.value === 'remote') {
        const normalized = normalizeApiServerUrl(remoteUrl)
        if (!normalized) {
            apiServerError.value = t('settings.basic.apiServer.invalidUrl')
            return
        }
        remoteUrl = normalized
        apiServerRemoteUrl.value = normalized
    }

    apiServerSaving.value = true
    apiServerError.value = ''
    try {
        const previous = loadApiServerPreferences()
        saveApiServerPreferences({
            mode: apiServerMode.value,
            remoteUrl: apiServerMode.value === 'remote' ? remoteUrl : previous.remoteUrl,
        })
        refreshApiServerEndpointLabel()
        await auth.signOut({silent: true})
        auth.openLoginDialog()
        layout.showSuccessToast(t('settings.basic.apiServer.saved'))
    } catch {
        apiServerError.value = t('settings.basic.apiServer.saveFailed')
    } finally {
        apiServerSaving.value = false
    }
}

onMounted(async () => {
    loadApiServerDraft()
    const settings = await loadConfigDirSettings()
    activeFromBackend.value = settings.activeFromBackend
    defaultPath.value = settings.defaultPath
    canChangeConfigDir.value = settings.canChange
    configDirInput.value = settings.configured ?? ''
    const trimmed = configDirInput.value.trim()
    previewPath.value = !trimmed
        ? (settings.defaultPath || settings.resolved || settings.activeFromBackend)
        : await resolveConfigDirectoryPath(trimmed)
})

watch(configDirInput, async (value) => {
    if (!canChangeConfigDir.value) return
    const trimmed = value.trim()
    previewPath.value = !trimmed
        ? defaultPath.value
        : await resolveConfigDirectoryPath(trimmed)
})

async function browseConfigDir() {
    const picked = await pickConfigDirectory()
    if (picked) configDirInput.value = picked
}

function resetConfigDir() {
    configDirInput.value = ''
    previewPath.value = defaultPath.value
}

async function saveConfigDir() {
    if (denyIfReadOnly()) return
    if (!canChangeConfigDir.value || configDirSaving.value) return
    restartConfirmOpen.value = true
}

async function confirmSaveConfigDir() {
    restartConfirmOpen.value = false
    configDirSaving.value = true
    configDirError.value = ''
    try {
        const ok = await applyConfigDirectoryAndRestart(configDirInput.value.trim() || null)
        if (!ok) {
            configDirError.value = t('settings.basic.workspaceRoot.saveFailed')
            configDirSaving.value = false
        }
    } catch {
        configDirError.value = t('settings.basic.workspaceRoot.saveFailed')
        configDirSaving.value = false
    }
}

async function copyDeepLinkExample() {
  try {
    await navigator.clipboard.writeText(deepLinkExample)
    deepLinkCopied.value = true
    layout.showSuccessToast(t('settings.basic.deepLink.copySuccess'))
    if (deepLinkCopiedTimer) clearTimeout(deepLinkCopiedTimer)
    deepLinkCopiedTimer = setTimeout(() => {
      deepLinkCopied.value = false
    }, 2000)
  } catch {
    layout.showErrorToast(t('settings.basic.deepLink.copyFailed'))
  }
}

function onToggleSnapshotPasswords() {
  if (denyIfReadOnly()) return
  snapshotIncludePasswords.value = !snapshotIncludePasswords.value
}

async function onExportConfigSnapshot() {
  if (denyIfReadOnly() || snapshotBusy.value) return
  snapshotBusy.value = true
  try {
    const result = await exportConfigSnapshot({includePasswords: snapshotIncludePasswords.value})
    layout.showSuccessToast(t('settings.basic.configSnapshot.exportSuccess', {
      connections: result.connectionCount,
      consoles: result.savedConsoleCount,
    }))
  } catch (error) {
    layout.showErrorToast(resolveCaughtApiErrorMessage(error, t, 'settings.basic.configSnapshot.exportFailed'))
  } finally {
    snapshotBusy.value = false
  }
}

async function onImportConfigSnapshot() {
  if (denyIfReadOnly() || snapshotBusy.value) return
  const file = await pickConfigSnapshotFile()
  if (!file) return
  snapshotBusy.value = true
  try {
    const result = await importConfigSnapshotText(await file.text())
    await Promise.all([explorer.refreshTree(), shortcutPanel.load()])
    layout.showSuccessToast(t('settings.basic.configSnapshot.importSuccess', {
      connections: result.connectionCount,
      consoles: result.savedConsoleCount,
    }))
  } catch (error) {
    layout.showErrorToast(resolveCaughtApiErrorMessage(error, t, 'settings.basic.configSnapshot.importFailed'))
  } finally {
    snapshotBusy.value = false
  }
}
</script>

<template>
  <SettingsPageShell
      :title="t('settings.basic.title')"
      :subtitle="t('settings.basic.subtitle')"
      :readonly="readOnly"
      :readonly-hint="hint"
  >
    <div class="settings-groups basic-settings">
      <div class="settings-tab-strip">
        <SettingsSegmentTabs
            stretch
            :model-value="basicTab"
            :tabs="basicTabs"
            :aria-label="t('settings.basic.title')"
            @update:model-value="basicTab = ($event as BasicTabId)"
        />
      </div>

      <!-- 外观：纵向分组，预览控件各占一行，避免左右失衡 -->
      <div v-if="basicTab === 'appearance'" class="basic-settings__pane settings-groups">
        <SettingsSectionCard
            :title="t('settings.basic.themeCardTitle')"
            :hint="t('settings.basic.themeCardHint')"
            icon="settings-basic"
            tone="primary"
        >
          <div class="basic-settings__group">
            <span class="basic-settings__group-label">{{ t('settings.basic.uiSkin') }}</span>
            <div
                class="dw-choice-grid"
                role="radiogroup"
                :aria-label="t('settings.basic.uiSkin')"
            >
              <ThemeSkinCard
                  v-for="skin in uiSkins"
                  :key="skin.id"
                  :variant="skin.id"
                  :active="theme.uiSkin === skin.id"
                  :label="t(skin.labelKey)"
                  :hint="t(skin.hintKey)"
                  @click="theme.setUiSkin(skin.id)"
              />
            </div>
          </div>

          <div class="basic-settings__group">
            <span class="basic-settings__group-label">{{ t('settings.basic.appearance') }}</span>
            <p class="hint basic-settings__group-hint">{{ t('settings.basic.appearanceHint') }}</p>
            <div
                class="dw-choice-grid"
                role="radiogroup"
                :aria-label="t('settings.basic.appearance')"
            >
              <ThemeAppearanceCard
                  v-for="appearance in appearances"
                  :key="appearance"
                  :variant="appearance"
                  :active="theme.appearance === appearance"
                  :label="t(`settings.basic.appearances.${appearance}`)"
                  @click="theme.setAppearance(appearance)"
              />
            </div>
          </div>

          <div class="basic-settings__group">
            <div class="basic-settings__group-head">
              <span class="basic-settings__group-label">{{ t('settings.basic.background') }}</span>
              <span class="basic-settings__group-value">{{ t(`settings.basic.backgroundTones.${theme.backgroundTone}`) }}</span>
            </div>
            <p class="hint basic-settings__group-hint">{{ t('settings.basic.backgroundHint') }}</p>
            <div
                class="color-row"
                role="radiogroup"
                :aria-label="t('settings.basic.background')"
            >
              <button
                  v-for="tone in backgroundTones"
                  :key="tone"
                  class="color-swatch"
                  :class="{ active: theme.backgroundTone === tone }"
                  type="button"
                  role="radio"
                  :aria-checked="theme.backgroundTone === tone"
                  :aria-pressed="theme.backgroundTone === tone"
                  :title="t(`settings.basic.backgroundTones.${tone}`)"
                  :aria-label="t(`settings.basic.backgroundTones.${tone}`)"
                  @click="theme.setBackgroundTone(tone)"
              >
                <span
                    class="color-dot"
                    :style="{ background: backgroundTonePresets[tone].bg }"
                />
                <span v-if="theme.backgroundTone === tone" class="check">✓</span>
              </button>
            </div>
          </div>

          <div class="basic-settings__group">
            <div class="basic-settings__group-head">
              <span class="basic-settings__group-label">{{ t('settings.basic.primary') }}</span>
              <span class="basic-settings__group-value">{{ t(`settings.basic.primaries.${theme.primaryTone}`) }}</span>
            </div>
            <div
                class="color-row"
                role="radiogroup"
                :aria-label="t('settings.basic.primary')"
            >
              <button
                  v-for="tone in primaryTones"
                  :key="tone"
                  class="color-swatch"
                  :class="{ active: theme.primaryTone === tone }"
                  type="button"
                  role="radio"
                  :aria-checked="theme.primaryTone === tone"
                  :aria-pressed="theme.primaryTone === tone"
                  :title="t(`settings.basic.primaries.${tone}`)"
                  :aria-label="t(`settings.basic.primaries.${tone}`)"
                  @click="theme.setPrimaryTone(tone)"
              >
                <span class="color-dot" :style="{ background: PRIMARY_PRESETS[tone].primary }"/>
                <span v-if="theme.primaryTone === tone" class="check">✓</span>
              </button>
            </div>
          </div>
        </SettingsSectionCard>

        <SettingsSectionCard
            :title="t('settings.basic.localeCardTitle')"
            :hint="t('settings.basic.localeCardHint')"
            icon="settings-basic"
            tone="sky"
        >
          <div class="basic-settings__group">
            <span class="basic-settings__group-label">{{ t('settings.basic.language') }}</span>
            <div
                class="basic-settings__choice-grid"
                role="radiogroup"
                :aria-label="t('settings.basic.language')"
            >
              <button
                  v-for="locale in locales"
                  :key="locale"
                  class="basic-settings__choice"
                  :class="{ 'is-active': currentLocale === locale }"
                  type="button"
                  role="radio"
                  :aria-checked="currentLocale === locale"
                  :aria-pressed="currentLocale === locale"
                  @click="setLocale(locale)"
              >
                <span class="basic-settings__choice-mark">{{ locale === 'zh-CN' ? '中' : 'En' }}</span>
                <span class="basic-settings__choice-copy">
                  <strong>{{ t(locale === 'zh-CN' ? 'locale.zhCN' : 'locale.enUS') }}</strong>
                </span>
              </button>
            </div>
          </div>

          <div class="basic-settings__group">
            <span class="basic-settings__group-label">{{ t('settings.basic.uiFont') }}</span>
            <p class="hint basic-settings__group-hint">{{ t('settings.basic.uiFontHint') }}</p>
            <FormField
                class="basic-ui-font-field"
                :label="t('settings.basic.uiFont')"
                input-id="basic-ui-font"
            >
              <template #default="{ id }">
                <SettingsSelect
                    :id="id"
                    side="top"
                    :searchable="false"
                    :model-value="theme.uiFont"
                    :options="uiFontOptions"
                    :disabled="readOnly"
                    @update:model-value="onUiFontChange"
                />
              </template>
            </FormField>
            <FormField
                v-if="theme.uiFont === 'custom'"
                class="basic-ui-font-custom-field"
                :label="t('settings.basic.uiFontCustom')"
                input-id="basic-ui-font-custom"
            >
              <DwInput
                  id="basic-ui-font-custom"
                  v-model="uiFontCustomDraft"
                  :placeholder="t('settings.basic.uiFontCustomPlaceholder')"
                  :disabled="readOnly"
                  @keydown.enter.prevent="onUiFontCustomCommit"
                  @blur="onUiFontCustomCommit"
              />
            </FormField>
            <p
                class="basic-ui-font-preview"
                :style="{ fontFamily: resolveUiFontPreviewFamily(theme.uiFont, theme.uiFontCustom) }"
            >
              {{ t('settings.basic.uiFontPreview') }}
            </p>
          </div>

          <div class="basic-settings__group">
            <span class="basic-settings__group-label">{{ t('settings.basic.uiTextScale') }}</span>
            <p class="hint basic-settings__group-hint">{{ t('settings.basic.uiTextScaleHint') }}</p>
            <SettingsSegmentTabs
                variant="inline"
                :model-value="theme.uiTextScale"
                :tabs="uiTextScaleTabs"
                :aria-label="t('settings.basic.uiTextScale')"
                @update:model-value="onUiTextScaleChange"
            />
            <FormField
                v-if="theme.uiTextScale === 'custom'"
                class="basic-ui-font-size-field"
                :label="t('settings.basic.uiFontSizePx')"
                input-id="basic-ui-font-size"
            >
              <DwInput
                  id="basic-ui-font-size"
                  v-model="uiFontSizeDraft"
                  type="number"
                  :min="UI_FONT_SIZE_PX_MIN"
                  :max="UI_FONT_SIZE_PX_MAX"
                  :step="UI_FONT_SIZE_PX_STEP"
                  :disabled="readOnly"
                  @keydown.enter.prevent="onUiFontSizeCommit"
                  @blur="onUiFontSizeCommit"
              />
            </FormField>
            <p v-if="theme.uiTextScale === 'custom'" class="hint basic-settings__group-hint">
              {{ t('settings.basic.uiFontSizePxHint', {min: UI_FONT_SIZE_PX_MIN, max: UI_FONT_SIZE_PX_MAX}) }}
            </p>
          </div>

          <div class="basic-settings__group">
            <span class="basic-settings__group-label">{{ t('settings.basic.uiDensity') }}</span>
            <p class="hint basic-settings__group-hint">{{ t('settings.basic.uiDensityHint') }}</p>
            <SettingsSegmentTabs
                variant="inline"
                :model-value="theme.uiDensity"
                :tabs="uiDensityTabs"
                :aria-label="t('settings.basic.uiDensity')"
                @update:model-value="onUiDensityChange"
            />
          </div>
        </SettingsSectionCard>
      </div>

      <!-- 连接：先选模式，再显示对应内容；外链用双选项卡 -->
      <div v-else-if="basicTab === 'connection'" class="basic-settings__pane settings-groups">
        <SettingsSectionCard
            :title="t('settings.basic.apiServer.title')"
            :hint="t('settings.basic.apiServer.hint')"
            icon="link"
            tone="sky"
            :badge="savedApiServerPrefs.mode === 'remote'
              ? t('settings.basic.apiServer.modes.remote')
              : t('settings.basic.apiServer.modes.local')"
        >
          <div class="basic-settings__group">
            <span class="basic-settings__group-label">{{ t('settings.basic.apiServer.mode') }}</span>
            <SettingsSegmentTabs
                variant="inline"
                :model-value="apiServerMode"
                :tabs="apiServerModeTabs"
                :aria-label="t('settings.basic.apiServer.mode')"
                @update:model-value="onApiServerModeChange"
            />
          </div>

          <div class="basic-settings__group">
            <template v-if="apiServerMode === 'local'">
              <span class="basic-settings__group-label">{{ t('settings.basic.apiServer.localEndpoint') }}</span>
              <p class="hint basic-settings__group-hint">{{ t('settings.basic.apiServer.localHint') }}</p>
              <code class="basic-settings__endpoint">{{ localApiEndpointLabel }}</code>
            </template>
            <template v-else>
              <FormField
                  :label="t('settings.basic.apiServer.remoteUrl')"
                  input-id="basic-api-server-url"
                  :error="apiServerError || undefined"
                  :hint="t('settings.basic.apiServer.remoteUrlHint')"
              >
                <DwInput
                    id="basic-api-server-url"
                    v-model="apiServerRemoteUrl"
                    class="config-dir-input"
                    :disabled="apiServerSaving"
                    :placeholder="t('settings.basic.apiServer.remoteUrlPlaceholder')"
                />
              </FormField>
            </template>

            <p v-if="pendingEndpointLabel" class="hint basic-api-pending">
              {{ t('settings.basic.apiServer.willConnect') }}：
              <code>{{ pendingEndpointLabel }}</code>
            </p>
            <p v-else class="hint basic-api-status">
              {{ t('settings.basic.apiServer.currentEndpoint') }}：
              <code>{{ apiServerStatusLabel }}</code>
            </p>
            <DwInlineAlert v-if="apiServerMode === 'local'" :message="apiServerError"/>
          </div>

          <div class="config-dir-actions">
            <DwButton
                variant="secondary"
                :disabled="apiServerSaving || apiServerTesting"
                :loading="apiServerTesting"
                @click="testApiServer"
            >
              {{ apiServerTesting ? t('settings.basic.apiServer.testing') : t('settings.basic.apiServer.test') }}
            </DwButton>
            <DwButton
                variant="primary"
                :disabled="apiServerSaving || apiServerTesting || !apiServerDirty"
                :loading="apiServerSaving"
                @click="saveApiServer"
            >
              {{ t('settings.basic.apiServer.save') }}
            </DwButton>
            <DwActionFeedback :message="apiServerTestMessage" :ok="apiServerTestOk"/>
          </div>
        </SettingsSectionCard>

        <SettingsSectionCard
            v-if="desktopApp"
            :title="t('settings.basic.openHttpLinks.title')"
            :hint="t('settings.basic.openHttpLinks.hint')"
            icon="open-external"
            tone="sky"
        >
          <div
              class="basic-settings__choice-grid"
              role="radiogroup"
              :aria-label="t('settings.basic.openHttpLinks.title')"
          >
            <button
                class="basic-settings__choice basic-settings__choice--stack"
                :class="{ 'is-active': openHttpLinksIn === 'builtin' }"
                type="button"
                role="radio"
                :aria-checked="openHttpLinksIn === 'builtin'"
                :aria-pressed="openHttpLinksIn === 'builtin'"
                :disabled="readOnly"
                @click="onOpenHttpLinksChange('builtin')"
            >
              <strong>{{ t('settings.basic.openHttpLinks.builtin') }}</strong>
              <span>{{ t('settings.basic.openHttpLinks.builtinHint') }}</span>
            </button>
            <button
                class="basic-settings__choice basic-settings__choice--stack"
                :class="{ 'is-active': openHttpLinksIn === 'system' }"
                type="button"
                role="radio"
                :aria-checked="openHttpLinksIn === 'system'"
                :aria-pressed="openHttpLinksIn === 'system'"
                :disabled="readOnly"
                @click="onOpenHttpLinksChange('system')"
            >
              <strong>{{ t('settings.basic.openHttpLinks.system') }}</strong>
              <span>{{ t('settings.basic.openHttpLinks.systemHint') }}</span>
            </button>
          </div>
        </SettingsSectionCard>

        <SettingsSectionCard
            v-if="desktopApp"
            :title="t('settings.basic.deepLink.title')"
            :hint="t('settings.basic.deepLink.hint')"
            icon="link"
            tone="panel"
        >
          <div class="deep-link-example-wrap">
            <p class="deep-link-example__label">{{ t('settings.basic.deepLink.exampleHint') }}</p>
            <div class="deep-link-example">
              <code class="deep-link-example__code">
                <span class="tok-scheme">datawise://</span><span class="tok-host">open</span><span
                    class="tok-punct"
                >?</span><template
                    v-for="(entry, index) in deepLinkExampleParams"
                    :key="entry.key"
                ><span v-if="index > 0" class="tok-punct">&amp;</span><span class="tok-key">{{ entry.key }}</span><span
                    class="tok-punct"
                >=</span><span class="tok-value">{{ entry.value }}</span></template>
              </code>
              <IconButton
                  size="sm"
                  :title="deepLinkCopied ? t('settings.basic.deepLink.copied') : t('settings.basic.deepLink.copyExample')"
                  :active="deepLinkCopied"
                  @click="copyDeepLinkExample"
              >
                <DwIcon v-if="!deepLinkCopied" name="copy" size="sm" :stroke-width="1.5"/>
                <DwIcon v-else name="submit" size="sm" :stroke-width="1.6"/>
              </IconButton>
            </div>
          </div>

          <p class="hint">{{ t('settings.basic.deepLink.actionsHint') }}</p>

          <table class="basic-settings__param-table">
            <thead>
              <tr>
                <th>{{ t('settings.basic.deepLink.paramColumn') }}</th>
                <th>{{ t('settings.basic.deepLink.requiredColumn') }}</th>
                <th>{{ t('settings.basic.deepLink.descColumn') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="param in deepLinkParamDefs" :key="param.key">
                <td><code>{{ param.key }}</code></td>
                <td>
                  {{
                    param.optional
                        ? t('settings.basic.deepLink.paramOptional')
                        : t('settings.basic.deepLink.paramRequired')
                  }}
                </td>
                <td>{{ t(param.descKey) }}</td>
              </tr>
            </tbody>
          </table>

          <p class="deep-link-footnote">
            <DwIcon name="about" size="sm" :stroke-width="1.5"/>
            {{ t('settings.basic.deepLink.desktopOnly') }}
          </p>
        </SettingsSectionCard>
      </div>

      <!-- 数据 -->
      <div v-else-if="basicTab === 'data'" class="basic-settings__pane settings-groups">
        <SettingsSectionCard
            v-if="activeFromBackend || previewPath || canChangeConfigDir"
            :title="t('settings.basic.workspaceRoot.title')"
            :hint="t('settings.basic.workspaceRoot.hint')"
            icon="folder"
            tone="panel"
        >
          <FormField :label="t('settings.basic.workspaceRoot.root')" input-id="basic-config-dir">
            <div class="config-dir-row">
              <DwInput
                  id="basic-config-dir"
                  v-model="configDirInput"
                  class="config-dir-input"
                  :disabled="!canChangeConfigDir || configDirSaving"
                  :placeholder="t('settings.basic.workspaceRoot.placeholder')"
              />
              <DwButton
                  v-if="canChangeConfigDir"
                  variant="secondary"
                  :disabled="configDirSaving"
                  @click="browseConfigDir"
              >
                {{ t('settings.basic.workspaceRoot.browse') }}
              </DwButton>
            </div>
          </FormField>

          <dl class="config-dir-meta">
            <div v-if="activeFromBackend" class="config-dir-meta__row">
              <dt>{{ t('settings.basic.workspaceRoot.activeNow') }}</dt>
              <dd>
                <code class="workspace-root__path-code" :title="activeFromBackend">{{ activeFromBackend }}</code>
              </dd>
            </div>
            <div v-if="previewPath" class="config-dir-meta__row">
              <dt>{{ t('settings.basic.workspaceRoot.afterRestart') }}</dt>
              <dd>
                <code class="workspace-root__path-code" :title="previewPath">{{ previewPath }}</code>
              </dd>
            </div>
          </dl>

          <DwInlineAlert
              v-if="workspacePathMismatch"
              variant="warning"
              :message="t('settings.basic.workspaceRoot.mismatchHint')"
          />

          <div class="workspace-root__subs" :aria-label="t('settings.basic.workspaceRoot.layoutTitle')">
            <span
                v-for="entry in DATA_DIRECTORY_SUBDIRS"
                :key="entry.id"
                class="workspace-root__sub"
            >
              {{ entry.segment }}/
            </span>
          </div>
          <p class="hint workspace-root__subs-hint">{{ t('settings.basic.workspaceRoot.layoutHint') }}</p>

          <div v-if="canChangeConfigDir" class="config-dir-actions">
            <DwButton variant="secondary" :disabled="configDirSaving" @click="resetConfigDir">
              {{ t('settings.basic.workspaceRoot.reset') }}
            </DwButton>
            <DwButton variant="primary" :disabled="configDirSaving" @click="saveConfigDir">
              {{ t('settings.basic.workspaceRoot.save') }}
            </DwButton>
          </div>
          <DwInlineAlert :message="configDirError"/>
        </SettingsSectionCard>

        <SettingsSectionCard
            :title="t('settings.basic.backupHub.title')"
            :hint="t('settings.basic.backupHub.hint')"
            icon="export"
            tone="sky"
        >
          <DwButton variant="primary" size="sm" @click="openConfigPortability">
            {{ t('settings.basic.backupHub.openPortability') }}
          </DwButton>
        </SettingsSectionCard>

        <SettingsSectionCard
            :title="t('settings.basic.configSnapshot.title')"
            :hint="t('settings.basic.configSnapshot.hint')"
            icon="file"
            tone="panel"
        >
          <LayoutToggleChip
              :label="t('settings.basic.configSnapshot.includePasswords')"
              :caption="t('settings.basic.configSnapshot.includePasswordsHint')"
              :active="snapshotIncludePasswords"
              @toggle="onToggleSnapshotPasswords"
          />
          <div class="config-snapshot__actions">
            <DwButton
                variant="secondary"
                size="sm"
                :loading="snapshotBusy"
                :disabled="readOnly"
                @click="onExportConfigSnapshot"
            >
              {{ t('settings.basic.configSnapshot.export') }}
            </DwButton>
            <DwButton
                variant="secondary"
                size="sm"
                :loading="snapshotBusy"
                :disabled="readOnly"
                @click="onImportConfigSnapshot"
            >
              {{ t('settings.basic.configSnapshot.import') }}
            </DwButton>
          </div>
        </SettingsSectionCard>
      </div>
    </div>
  </SettingsPageShell>

  <ConfirmDialog
      v-model:open="restartConfirmOpen"
      :title="t('settings.basic.workspaceRoot.title')"
      :message="t('settings.basic.workspaceRoot.restartConfirm')"
      :confirm-label="t('common.confirm')"
      :confirm-loading="configDirSaving"
      @confirm="confirmSaveConfigDir"
  />
</template>
