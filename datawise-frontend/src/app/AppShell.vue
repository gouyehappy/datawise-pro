<script setup lang="ts">
import {computed, onMounted, watch} from 'vue'
import {storeToRefs} from 'pinia'
import AppSideRail from '@/features/layout/components/AppSideRail.vue'
import MainContent from '@/features/layout/components/MainContent.vue'
import StatusBar from '@/features/layout/components/StatusBar.vue'
import NotificationDrawer from '@/features/layout/components/NotificationDrawer.vue'
import GlobalObjectSearchPalette from '@/features/layout/components/GlobalObjectSearchPalette.vue'
import LoginDialog from '@/features/auth/components/LoginDialog.vue'
import ChangePasswordDialog from '@/features/settings/components/ChangePasswordDialog.vue'
import AppToast from '@/core/components/AppToast.vue'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useAppShortcutListener} from '@/features/layout/composables/useAppShortcutListener'
import {registerGlobalShortcutActions} from '@/features/layout/services/register-global-shortcut-actions'
import {registerShortcutsHost} from '@/features/layout/services/register-shortcuts-host'
import {registerCodeEditorHost} from '@/core/code/register-code-editor-host'
import {registerDataGridHost} from '@/features/layout/services/register-data-grid-host'
import {registerUiI18nHost} from '@/features/layout/services/register-ui-i18n-host'
import {registerStatusDomainsHost} from '@/features/layout/services/register-status-domains-host'
import {useConnectionHealthMonitor} from '@/features/explorer/composables/useConnectionHealthMonitor'
import {useBackendHealthMonitor} from '@/features/layout/composables/useBackendHealthMonitor'
import {useSessionKeepalive} from '@/features/auth/composables/useSessionKeepalive'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {useI18n} from 'vue-i18n'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

import OnboardingSpotlightTour from '@/features/onboarding/components/OnboardingSpotlightTour.vue'
import RuntimeSetupWizard from '@/features/onboarding/components/RuntimeSetupWizard.vue'
import DriverInstallProgressModal from '@/features/connection/components/DriverInstallProgressModal.vue'
import {useOnboardingGuide} from '@/features/onboarding/composables/useOnboardingGuide'
import {useRuntimeSetupWizard} from '@/features/onboarding/composables/useRuntimeSetupWizard'
import {shouldShowLoginDialog} from '@/features/onboarding/services/onboarding.service'
import {
    resolveFirstRunFunnelStep,
    shouldContinueToUiTourAfterRuntime,
} from '@/features/onboarding/services/onboarding-funnel.service'
import {isDesktopApp} from '@/features/layout/services/desktop-chrome'
import {useDeepLinkListener} from '@/features/layout/composables/useDeepLinkListener'
import {useDesktopFileOpenListener} from '@/features/layout/composables/useDesktopFileOpenListener'
import {useUpdaterListener} from '@/features/settings/composables/useUpdaterListener'
import {useProjectDocumentTitle} from '@/features/project/composables/useProjectDocumentTitle'
import PackPaywallDialog from '@/features/pack/components/PackPaywallDialog.vue'
import TrialEndingBanner from '@/features/pack/components/TrialEndingBanner.vue'
import AppBootWorkspace from '@/app/components/AppBootWorkspace.vue'
import ShortcutCheatsheetOverlay from '@/features/layout/components/ShortcutCheatsheetOverlay.vue'
import {useShortcutCheatsheet} from '@/features/layout/composables/useShortcutCheatsheet'
import {useWorkbenchContextPublisher} from '@/features/ai/context/composables/useWorkbenchContextPublisher'
import {useDockViewportSync} from '@/features/dock/composables/useDockViewportSync'
import McpConfirmDrawer from '@/features/ai/mcp-confirm/components/McpConfirmDrawer.vue'
import AssistantDrawer from '@/features/ai/assistant/components/AssistantDrawer.vue'

const props = withDefaults(
    defineProps<{
        /** 桌面 Shell-first 启动：主区显示占位层而非真实内容 */
        booting?: boolean
    }>(),
    {booting: false},
)

const layout = useLayoutStore()
const appConfig = useAppConfigStore()
const auth = useAuthStore()
const toast = useAppToast()
const {t} = useI18n()
const {loginDialogOpen, loginOverWizards, mustChangePassword} = storeToRefs(auth)
const {
    open: onboardingOpen,
    preset: onboardingPreset,
    showGuide,
    finishGuide,
    skipGuide,
} = useOnboardingGuide()
const {open: runtimeSetupOpen, show: showRuntimeSetup} = useRuntimeSetupWizard()

const showLoginDialog = computed(() =>
    shouldShowLoginDialog({
        loginDialogOpen: loginDialogOpen.value,
        onboardingOpen: onboardingOpen.value,
        runtimeSetupOpen: runtimeSetupOpen.value,
        loginOverWizards: loginOverWizards.value,
    }),
)

function onOnboardingFinish() {
    finishGuide()
}

function onOnboardingSkip() {
    skipGuide()
}

function onRuntimeSetupClosed() {
    if (shouldContinueToUiTourAfterRuntime()) {
        showGuide()
    }
}

async function maybeStartFirstRunFunnel() {
    const step = await resolveFirstRunFunnelStep()
    if (step === 'runtime-setup') {
        showRuntimeSetup()
        return
    }
    if (step === 'ui-tour') {
        showGuide()
    }
}

function onLoginDialogOpen(open: boolean) {
    if (open) {
        auth.openLoginDialog()
        return
    }
    auth.closeLoginDialog()
}

function onForcedPasswordChanged() {
    auth.clearMustChangePassword()
    toast.success(t('profile.changePasswordSuccess'))
}

useAppShortcutListener()
registerShortcutsHost()
registerGlobalShortcutActions()
registerUiI18nHost()
registerStatusDomainsHost()
registerDataGridHost()
registerCodeEditorHost()
useConnectionHealthMonitor()
useBackendHealthMonitor()
useSessionKeepalive()
useDeepLinkListener()
useDesktopFileOpenListener()
useUpdaterListener()
useProjectDocumentTitle()
useWorkbenchContextPublisher()
useDockViewportSync()

const {open: shortcutCheatsheetOpen} = useShortcutCheatsheet()

/**
   * Database / AI / ModuleWorkbench each mount ShortcutRail when the strip is on.
   * Standalone drawers must not also mount — otherwise AI 页会出现双助手。
   */
const hasEmbeddedToolRail = computed(() => appConfig.showShortcutRail)

const showStandaloneNotification = computed(
    () => layout.showNotificationDrawer && !hasEmbeddedToolRail.value,
)

const showStandaloneAssistant = computed(
    () => layout.showAssistantDrawer && !hasEmbeddedToolRail.value,
)

const desktopApp = isDesktopApp()

onMounted(async () => {
  const params = new URLSearchParams(window.location.search)
  const oidcSession = params.get('oidcSession')
  const oidcError = params.get('oidcError')
  const oidcUser = params.get('oidcUser')
  if (oidcError) {
    toast.error(t('auth.oidcFailed', {error: oidcError}))
  } else if (oidcSession) {
    try {
      await auth.completeOidcLogin(oidcSession, oidcUser || undefined)
      toast.success(t('auth.oidcSuccess'))
    } catch (error) {
      toast.error(resolveCaughtApiErrorMessage(error, t, 'auth.failed'))
    }
  }
  if (oidcSession || oidcError || oidcUser) {
    params.delete('oidcSession')
    params.delete('oidcError')
    params.delete('oidcUser')
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`
    window.history.replaceState({}, '', next)
  }

  // First-run funnel: runtime setup (desktop) → UI tour with team touchpoint.
  if (!props.booting) {
    await maybeStartFirstRunFunnel()
  }
})

watch(
  () => props.booting,
  async (booting, wasBooting) => {
    if (wasBooting && !booting) {
      await maybeStartFirstRunFunnel()
    }
  },
)
</script>

<template>
  <div class="shell" :class="{'shell--desktop': desktopApp, 'shell--booting': props.booting}">
    <div class="shell-body">
      <AppSideRail v-if="appConfig.showSideRailStrip"/>
      <div class="shell-main shell-main--boot-host">
        <Transition name="boot-handoff" mode="out-in">
          <AppBootWorkspace v-if="props.booting" key="boot"/>
          <div v-else key="main" class="shell-main__content">
            <TrialEndingBanner/>
            <MainContent/>
          </div>
        </Transition>
      </div>
    </div>
    <StatusBar/>
    <!--
      Teleport mount for explorer/terminal/shortcut floats.
      display:contents so in-place workspace floats share the same z-order.
    -->
    <div
        id="dock-float-root"
        class="dock-float-root"
    />
    <NotificationDrawer v-if="showStandaloneNotification"/>
    <AssistantDrawer v-if="showStandaloneAssistant"/>
    <RuntimeSetupWizard
        v-model:open="runtimeSetupOpen"
        @finish="onRuntimeSetupClosed"
        @skip="onRuntimeSetupClosed"
    />
    <DriverInstallProgressModal/>
    <OnboardingSpotlightTour
        v-model:open="onboardingOpen"
        :preset="onboardingPreset"
        @finish="onOnboardingFinish"
        @skip="onOnboardingSkip"
    />
    <LoginDialog :open="showLoginDialog" @update:open="onLoginDialogOpen"/>
    <ChangePasswordDialog
        :open="mustChangePassword"
        forced
        @success="onForcedPasswordChanged"
    />
    <GlobalObjectSearchPalette/>
    <ShortcutCheatsheetOverlay v-model:open="shortcutCheatsheetOpen"/>
    <PackPaywallDialog/>
    <McpConfirmDrawer/>
    <AppToast/>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  width: 100%;
}

.shell-body {
  display: flex;
  flex: 1;
  min-height: 0;
  gap: var(--dw-panel-gap);
  /* Bottom chrome is the status bar (height includes --dw-shell-padding). */
  padding: var(--dw-shell-padding);
  padding-bottom: 0;
  background: var(--dw-bg-chrome);
}

.shell-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  gap: var(--dw-panel-gap);
  background: transparent;
}

.shell-main--boot-host {
  position: relative;
  overflow: hidden;
}

.shell-main__content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: var(--dw-panel-gap);
}

.boot-handoff-enter-active,
.boot-handoff-leave-active {
  transition: opacity 0.24s ease;
}

.boot-handoff-enter-from,
.boot-handoff-leave-to {
  opacity: 0;
}

.shell--booting .shell-body :deep(.tool-stripe),
.shell--booting .shell-body :deep(.nav-rail),
.shell--booting .shell-body :deep(.side-rail) {
  opacity: 0.72;
  pointer-events: none;
}

.dock-float-root {
  /* Flatten so in-place workspace floats share z-order with teleported hosts. */
  display: contents;
}
</style>
