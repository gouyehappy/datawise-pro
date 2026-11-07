<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {useThemeStore} from '@/features/settings/stores/theme-store'
import {useUpdateSettingsStore} from '@/features/settings/stores/update-settings'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {useLockScreenStore} from '@/features/auth/stores/lock-screen-store'
import {useShortcutSettingsStore} from '@/features/settings/stores/shortcut-settings-store'
import {formatBinding} from '@/core/shortcuts/shortcut.service'
import {openUrl} from '@/shared/browser/open-url'

/** Override with VITE_GITHUB_REPO=owner/name; default matches desktop update channel. */
const GITHUB_REPO_SLUG =
  (import.meta.env.VITE_GITHUB_REPO as string | undefined)?.trim() || 'gouyehappy/datawise-cli'
const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO_SLUG}`

const {t} = useI18n()
const layout = useLayoutStore()
const entitlement = useEntitlementStore()
const theme = useThemeStore()
const updateSettings = useUpdateSettingsStore()
const auth = useAuthStore()
const lockScreen = useLockScreenStore()
const shortcuts = useShortcutSettingsStore()

const hasUpdate = computed(() => Boolean(updateSettings.lastCheck?.hasUpdate))
const themeIcon = computed(() => (theme.resolvedMode === 'dark' ? 'sun' : 'moon'))
const themeTitle = computed(() =>
    theme.resolvedMode === 'dark'
        ? t('app.titleBar.quick.themeLight')
        : t('app.titleBar.quick.themeDark'),
)
const lockTitle = computed(() => {
  const hint = formatBinding(shortcuts.getBinding('app.lockScreen'))
  const base = t('app.titleBar.quick.lock')
  return hint ? `${base} (${hint})` : base
})

async function onCheckUpdate() {
  try {
    const result = await updateSettings.runUpdateCheck()
    if (result?.hasUpdate) {
      layout.openSettingsModule('about')
      layout.showSuccessToast(
          t('app.titleBar.quick.updateAvailable', {
            version: result.latestVersion || '',
          }),
      )
      return
    }
    layout.showSuccessToast(t('app.titleBar.quick.updateLatest'))
  } catch {
    layout.openSettingsModule('about')
    layout.showWarningToast(t('app.titleBar.quick.updateFailed'))
  }
}

function onToggleTheme() {
  theme.toggleMode()
}

function onOpenAi() {
  if (!entitlement.guardAiNav()) return
  layout.setModule('ai')
}

function onOpenSettings() {
  layout.openSettingsModule('basic')
}

function onLockScreen() {
  lockScreen.lock()
}

async function onOpenGithub() {
  await openUrl(GITHUB_REPO_URL)
}
</script>

<template>
  <div class="titlebar-quick" role="toolbar" :aria-label="t('app.titleBar.quick.label')">
    <button
        type="button"
        class="titlebar-quick__btn"
        :class="{ 'is-busy': updateSettings.checking }"
        :title="t('app.titleBar.quick.update')"
        :aria-label="t('app.titleBar.quick.update')"
        :disabled="updateSettings.checking"
        @click="onCheckUpdate"
    >
      <DwIcon name="refresh" size="sm" :stroke-width="1.5"/>
      <span v-if="hasUpdate" class="titlebar-quick__badge" aria-hidden="true"/>
    </button>
    <button
        type="button"
        class="titlebar-quick__btn"
        :title="themeTitle"
        :aria-label="themeTitle"
        @click="onToggleTheme"
    >
      <DwIcon :name="themeIcon" size="sm" :stroke-width="1.5"/>
    </button>
    <button
        v-if="auth.canLockScreen"
        type="button"
        class="titlebar-quick__btn"
        :title="lockTitle"
        :aria-label="lockTitle"
        @click="onLockScreen"
    >
      <DwIcon name="lock" size="sm" :stroke-width="1.5"/>
    </button>
    <button
        type="button"
        class="titlebar-quick__btn"
        :class="{ 'is-active': layout.activeModule === 'ai' }"
        :title="t('app.titleBar.quick.ai')"
        :aria-label="t('app.titleBar.quick.ai')"
        @click="onOpenAi"
    >
      <DwIcon name="ai" size="sm" :stroke-width="1.5"/>
    </button>
    <button
        type="button"
        class="titlebar-quick__btn"
        :title="t('app.titleBar.quick.settings')"
        :aria-label="t('app.titleBar.quick.settings')"
        @click="onOpenSettings"
    >
      <DwIcon name="settings" size="sm" :stroke-width="1.5"/>
    </button>
    <button
        v-if="GITHUB_REPO_URL"
        type="button"
        class="titlebar-quick__btn"
        :title="t('app.titleBar.quick.github')"
        :aria-label="t('app.titleBar.quick.github')"
        @click="onOpenGithub"
    >
      <DwIcon name="github" size="sm" :stroke-width="1.5"/>
    </button>
  </div>
</template>

<style scoped>
.titlebar-quick {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  height: 100%;
  padding: 0 4px 0 2px;
  -webkit-app-region: no-drag;
}

.titlebar-quick__btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: var(--dw-density-sm);
  margin: 0;
  padding: 0;
  border: none;
  border-radius: var(--dw-titlebar-chip-radius);
  background: transparent;
  color: var(--dw-text-secondary);
  cursor: pointer;
  transition: background 100ms ease, color 100ms ease;
}

.titlebar-quick__btn:hover:not(:disabled) {
  background: var(--dw-titlebar-chip-hover);
  color: var(--dw-text);
}

.titlebar-quick__btn.is-active {
  color: var(--dw-primary);
}

.titlebar-quick__btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.titlebar-quick__btn.is-busy {
  opacity: 0.7;
}

.titlebar-quick__badge {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dw-danger);
  box-shadow: 0 0 0 1px var(--dw-bg-chrome);
}
</style>
