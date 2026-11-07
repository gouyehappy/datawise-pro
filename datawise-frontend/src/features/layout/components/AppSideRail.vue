<!-- 最左侧竖条导航：模块切换 + 底部 Terminal（IDEA 工具窗口布局） -->
<script setup lang="ts">
import {computed, onUnmounted, ref, watch, type ComponentPublicInstance} from 'vue'
import {useI18n} from 'vue-i18n'
import {storeToRefs} from 'pinia'
import {usePopoverEscape} from '@/core/composables/usePopoverEscape'
import ProfileMenuPopover from '@/features/layout/components/ProfileMenuPopover.vue'
import AppBrandLogo from '@/features/layout/components/AppBrandLogo.vue'
import ExplorerRailFlyout from '@/features/explorer/components/ExplorerRailFlyout.vue'
import {DwIcon, sideRailDwIcon} from '@/core/icons'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {SIDE_RAIL_NAV_DEFS, type SideRailItemId} from '@/features/layout/constants/side-rail-nav'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useNotificationStore} from '@/features/layout/stores/notification-store'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {runExplorerRefresh} from '@/features/explorer/services/explorer-toolbar.actions'
import {isDesktopApp} from '@/features/layout/services/desktop-chrome'
import {useConnectorUpdateBadge} from '@/features/layout/composables/useConnectorUpdateBadge'

const {t} = useI18n()
const layout = useLayoutStore()
const appConfig = useAppConfigStore()
const pluginStore = usePluginStore()
const entitlement = useEntitlementStore()
const notifications = useNotificationStore()
const {showProfileMenu} = storeToRefs(layout)
const desktopApp = isDesktopApp()
const profileMenuRootRef = ref<HTMLElement>()
const {connectorUpdateCount} = useConnectorUpdateBadge()

const databaseAnchorRef = ref<HTMLElement | null>(null)
const explorerFlyoutRef = ref<{rootEl?: HTMLElement | null} | null>(null)
const explorerFlyoutOpen = ref(false)
/** 固定侧栏时跳过离场动画，避免与停靠面板叠影 */
const explorerFlyoutInstant = ref(false)
let explorerFlyoutLeaveTimer: ReturnType<typeof setTimeout> | null = null
let explorerFlyoutOpenTimer: ReturnType<typeof setTimeout> | null = null

const EXPLORER_FLYOUT_OPEN_MS = 90
const EXPLORER_FLYOUT_LEAVE_MS = 180

function setDatabaseAnchor(
  el: Element | ComponentPublicInstance | null,
  _refs?: Record<string, unknown>,
) {
  const node = el && '$el' in el ? el.$el : el
  databaseAnchorRef.value = node instanceof HTMLElement ? node : null
}

function contextMenuNodes(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.dw-ctx-menu, .dw-ctx-menu-anchor'))
}

const explorerFlyoutTransition = computed(() =>
  explorerFlyoutInstant.value ? '' : 'explorer-rail-flyout',
)

// 桌面端资料菜单在 TitleBarAppMenu（Teleport），侧栏无触发器；
// 若仍启用 outside dismiss，containRefs 恒为空，pointerdown 会在 click 前关掉菜单。
usePopoverEscape(showProfileMenu, () => layout.closeProfileMenu(), desktopApp
  ? {closeOnOutside: false}
  : {containRefs: () => [profileMenuRootRef.value]},
)

usePopoverEscape(explorerFlyoutOpen, () => {
  dismissExplorerFlyout()
}, {
  containRefs: () => [
    databaseAnchorRef.value,
    explorerFlyoutRef.value?.rootEl ?? null,
    ...contextMenuNodes(),
  ],
})

interface NavItem {
  id: SideRailItemId
  labelKey: string
  captionKey: string
  section: 'main' | 'util' | 'bottom'
}

const navDefs = SIDE_RAIL_NAV_DEFS

const mainItems = computed(() =>
    navDefs
        .filter((item) => item.section === 'main' && appConfig.isSideRailVisible(item.id))
        // Standard edition keeps AI rail as an upsell entry (guardAiNav → Paywall).
        .map((item) => ({
          ...item,
          label: t(item.labelKey),
          caption: t(item.captionKey),
        })),
)

const utilItems = computed(() =>
    navDefs
        .filter((item) => item.section === 'util' && appConfig.isSideRailVisible(item.id))
        .map((item) => ({
          ...item,
          label: t(item.labelKey),
          caption: t(item.captionKey),
        })),
)

const terminalItem = computed(() => {
  const item = navDefs.find((entry) => entry.id === 'terminal')
  if (!item || !appConfig.isSideRailVisible('terminal')) return null
  return {
    ...item,
    label: t(item.labelKey),
    caption: t(item.captionKey),
  }
})

function clearExplorerFlyoutLeaveTimer() {
  if (explorerFlyoutLeaveTimer != null) {
    clearTimeout(explorerFlyoutLeaveTimer)
    explorerFlyoutLeaveTimer = null
  }
}

function clearExplorerFlyoutOpenTimer() {
  if (explorerFlyoutOpenTimer != null) {
    clearTimeout(explorerFlyoutOpenTimer)
    explorerFlyoutOpenTimer = null
  }
}

function openExplorerFlyout() {
  if (appConfig.showExplorerPanel) return
  clearExplorerFlyoutLeaveTimer()
  clearExplorerFlyoutOpenTimer()
  explorerFlyoutOpenTimer = setTimeout(() => {
    explorerFlyoutOpenTimer = null
    if (appConfig.showExplorerPanel) return
    explorerFlyoutInstant.value = false
    explorerFlyoutOpen.value = true
  }, EXPLORER_FLYOUT_OPEN_MS)
}

function scheduleCloseExplorerFlyout() {
  clearExplorerFlyoutOpenTimer()
  clearExplorerFlyoutLeaveTimer()
  explorerFlyoutLeaveTimer = setTimeout(() => {
    // 右键菜单 Teleport 到 body：指针移入菜单时勿收起树
    if (contextMenuNodes().length) {
      scheduleCloseExplorerFlyout()
      return
    }
    explorerFlyoutInstant.value = false
    explorerFlyoutOpen.value = false
    explorerFlyoutLeaveTimer = null
  }, EXPLORER_FLYOUT_LEAVE_MS)
}

function onDatabaseEnter() {
  openExplorerFlyout()
}

function onDatabaseLeave() {
  scheduleCloseExplorerFlyout()
}

function onExplorerFlyoutEnter() {
  clearExplorerFlyoutOpenTimer()
  clearExplorerFlyoutLeaveTimer()
}

function onExplorerFlyoutLeave() {
  scheduleCloseExplorerFlyout()
}

function dismissExplorerFlyout() {
  clearExplorerFlyoutOpenTimer()
  clearExplorerFlyoutLeaveTimer()
  explorerFlyoutOpen.value = false
}

function pinExplorerFromFlyout() {
  explorerFlyoutInstant.value = true
  if (!appConfig.showExplorerPanel) {
    appConfig.setShowExplorerPanel(true)
  }
  layout.setModule('database')
  dismissExplorerFlyout()
}

watch(
  () => appConfig.showExplorerPanel,
  (visible) => {
    if (visible) dismissExplorerFlyout()
  },
)

onUnmounted(() => {
  clearExplorerFlyoutOpenTimer()
  clearExplorerFlyoutLeaveTimer()
})

function onClick(id: NavItem['id']) {
  if (!appConfig.isSideRailVisible(id)) return
  if (id === 'refresh') {
    void runExplorerRefresh()
    return
  }
  if (id === 'notify') {
    layout.toggleNotificationDrawer()
    return
  }
  if (id === 'assistant') {
    if (!entitlement.guardAiNav()) return
    if (!pluginStore.isEnabled('p-ai-workbench')) {
      layout.setModule('packStore')
      return
    }
    layout.toggleAssistantDrawer()
    return
  }
  if (id === 'feedback') {
    layout.showToast(t('nav.feedbackToast'))
    return
  }
  if (id === 'terminal') {
    layout.toggleTerminalPanel()
    return
  }
  if (id === 'database') {
    dismissExplorerFlyout()
    if (layout.activeModule === 'database' && appConfig.showExplorerPanel) {
      appConfig.setShowExplorerPanel(false)
      return
    }
    if (!appConfig.showExplorerPanel) {
      appConfig.setShowExplorerPanel(true)
    }
    layout.setModule('database')
    return
  }
  if (id === 'ai') {
    if (!entitlement.guardAiNav()) {
      return
    }
    if (!pluginStore.isEnabled('p-ai-workbench')) {
      layout.setModule('packStore')
      return
    }
    layout.setModule('ai')
    return
  }
  layout.setModule(id)
}

function isActive(id: NavItem['id']) {
  if (id === 'notify') return layout.showNotificationDrawer
  if (id === 'assistant') return layout.showAssistantDrawer
  if (id === 'terminal') return layout.showTerminalPanel
  if (id === 'database') {
    return (layout.activeModule === 'database' && appConfig.showExplorerPanel)
      || explorerFlyoutOpen.value
  }
  return id === layout.activeModule
}

function toggleProfileMenu() {
  layout.toggleProfileMenu()
}
</script>

<template>
  <aside class="tool-stripe tool-stripe--left">
    <div v-if="!desktopApp" ref="profileMenuRootRef" class="nav-brand" data-onboarding="nav-home">
      <button
          class="tool-btn tool-btn--brand tool-btn--stack"
          :class="{ active: layout.showProfileMenu }"
          type="button"
          :aria-label="layout.profileName"
          @click="toggleProfileMenu"
      >
        <span class="tool-btn__graphic tool-btn__graphic--brand">
          <AppBrandLogo/>
        </span>
        <span class="tool-btn__caption">{{ t('nav.caption.home') }}</span>
      </button>
      <ProfileMenuPopover v-if="layout.showProfileMenu" @close="layout.closeProfileMenu()"/>
    </div>

    <nav class="tool-stripe__group" :aria-label="t('nav.mainLabel')">
      <template v-for="item in mainItems" :key="item.id">
        <div
            v-if="item.id === 'database'"
            :ref="setDatabaseAnchor"
            class="tool-stripe__flyout-anchor"
            @mouseenter="onDatabaseEnter"
            @mouseleave="onDatabaseLeave"
        >
          <button
              class="tool-btn tool-btn--stack"
              :class="{ active: isActive(item.id) }"
              data-onboarding="nav-database"
              type="button"
              :aria-label="item.label"
              :aria-current="isActive(item.id) ? 'page' : undefined"
              :aria-expanded="explorerFlyoutOpen"
              @click="onClick(item.id)"
          >
            <span class="tool-btn__graphic">
              <DwIcon :name="sideRailDwIcon(item.id)" size="rail" :stroke-width="1.7"/>
            </span>
            <span class="tool-btn__caption">{{ item.caption }}</span>
          </button>
        </div>
        <button
            v-else
            class="tool-btn tool-btn--stack"
            :class="{ active: isActive(item.id) }"
            :data-onboarding="item.id === 'ai' ? 'nav-ai' : undefined"
            type="button"
            :aria-label="item.label"
            :aria-current="isActive(item.id) ? 'page' : undefined"
            @click="onClick(item.id)"
        >
          <span class="tool-btn__graphic">
            <DwIcon :name="sideRailDwIcon(item.id)" size="rail" :stroke-width="1.7"/>
            <span
                v-if="item.id === 'connectorMarket' && connectorUpdateCount"
                class="tool-btn__badge"
                :title="t('nav.connectorUpdatesBadge', {count: connectorUpdateCount})"
            >
              {{ connectorUpdateCount }}
            </span>
          </span>
          <span class="tool-btn__caption">{{ item.caption }}</span>
        </button>
      </template>
    </nav>

    <div class="tool-stripe__spacer" aria-hidden="true"/>

    <nav class="tool-stripe__group" :aria-label="t('nav.utilLabel')">
      <button
          v-for="item in utilItems"
          :key="item.id"
          class="tool-btn tool-btn--stack"
          :class="{ active: isActive(item.id) }"
          type="button"
          :aria-label="item.label"
          @click="onClick(item.id)"
      >
        <span class="tool-btn__graphic">
          <template v-if="item.id === 'notify'">
            <DwIcon :name="sideRailDwIcon(item.id)" size="rail" :stroke-width="1.7"/>
            <span v-if="notifications.unreadCount" class="tool-btn__badge">{{ notifications.unreadCount }}</span>
          </template>
          <DwIcon v-else :name="sideRailDwIcon(item.id)" size="rail" :stroke-width="1.7"/>
        </span>
        <span class="tool-btn__caption">{{ item.caption }}</span>
      </button>
    </nav>

    <nav
        v-if="terminalItem"
        class="tool-stripe__group tool-stripe__group--bottom"
        :aria-label="terminalItem.label"
    >
      <button
          class="tool-btn tool-btn--stack"
          :class="{ active: isActive('terminal') }"
          type="button"
          data-onboarding="nav-terminal"
          :aria-label="terminalItem.label"
          :aria-pressed="layout.showTerminalPanel"
          @click="onClick('terminal')"
      >
        <span class="tool-btn__graphic">
          <DwIcon name="terminal" size="rail" :stroke-width="1.7"/>
        </span>
        <span class="tool-btn__caption">{{ terminalItem.caption }}</span>
      </button>
    </nav>

    <Teleport to="body">
      <Transition :name="explorerFlyoutTransition">
        <KeepAlive :max="1">
          <ExplorerRailFlyout
              v-if="explorerFlyoutOpen"
              key="explorer-rail-flyout"
              ref="explorerFlyoutRef"
              :anchor="databaseAnchorRef"
              @mouseenter="onExplorerFlyoutEnter"
              @mouseleave="onExplorerFlyoutLeave"
              @dismiss="dismissExplorerFlyout"
              @pin="pinExplorerFromFlyout"
          />
        </KeepAlive>
      </Transition>
    </Teleport>
  </aside>
</template>

<style scoped>
.tool-stripe__flyout-anchor {
  width: 100%;
}
</style>

<style>
/* Teleport 到 body，需非 scoped */
.explorer-rail-flyout-enter-active,
.explorer-rail-flyout-leave-active {
  transition:
      opacity var(--dw-duration-slow, 0.2s) var(--dw-ease, ease),
      transform var(--dw-duration-slow, 0.2s) var(--dw-ease, ease);
}

.explorer-rail-flyout-enter-active .explorer-rail-flyout__panel,
.explorer-rail-flyout-leave-active .explorer-rail-flyout__panel {
  transition:
      opacity var(--dw-duration-slow, 0.2s) var(--dw-ease, ease),
      transform var(--dw-duration-slow, 0.2s) cubic-bezier(0.22, 1, 0.36, 1);
}

.explorer-rail-flyout-enter-from,
.explorer-rail-flyout-leave-to {
  opacity: 0;
}

.explorer-rail-flyout-enter-from .explorer-rail-flyout__panel,
.explorer-rail-flyout-leave-to .explorer-rail-flyout__panel {
  opacity: 0;
  transform: translateX(-6px);
}

@media (prefers-reduced-motion: reduce) {
  .explorer-rail-flyout-enter-active,
  .explorer-rail-flyout-leave-active,
  .explorer-rail-flyout-enter-active .explorer-rail-flyout__panel,
  .explorer-rail-flyout-leave-active .explorer-rail-flyout__panel {
    transition: none;
  }
}
</style>
