<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'
import {ConfirmDialog} from '@/core/components'
import AppBrandLogo from '@/features/layout/components/AppBrandLogo.vue'
import DesktopTitleBarMenu from '@/features/layout/components/DesktopTitleBarMenu.vue'
import TitleBarAppMenu from '@/features/layout/components/TitleBarAppMenu.vue'
import TitleBarQuickActions from '@/features/layout/components/TitleBarQuickActions.vue'
import WorkspaceSwitcher from '@/features/layout/components/WorkspaceSwitcher.vue'
import WorkspaceActionDialogs from '@/features/layout/components/WorkspaceActionDialogs.vue'
import {useDesktopTitleBar} from '@/features/layout/composables/useDesktopTitleBar'
import {useLocalFilesUnsavedExitGuard} from '@/features/local-files/composables/useLocalFilesUnsavedExitGuard'
import {confirmLocalFilesExitIfNeeded} from '@/features/local-files/services/local-files-exit-guard'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'

const {t} = useI18n()
const {visible, maximized, isMac, minimize, toggleMaximize, close, beginFramelessWindowDrag} = useDesktopTitleBar()
const {exitConfirm} = useLocalFilesUnsavedExitGuard()
const appConfig = useAppConfigStore()

async function onClose() {
  if (!(await confirmLocalFilesExitIfNeeded())) return
  // CEF dispose does not reliably fire beforeunload; flush tabs before native close.
  await appConfig.flushWorkspaceSessionOnExitAsync()
  close()
}
</script>

<template>
  <header
      v-if="visible"
      class="desktop-titlebar"
      :class="{'desktop-titlebar--mac': isMac}"
  >
    <!-- IDEA: logo + hamburger -->
    <div class="desktop-titlebar__brand">
      <div
          class="desktop-titlebar__icon"
          @pointerdown="beginFramelessWindowDrag"
          @dblclick.stop="toggleMaximize"
      >
        <AppBrandLogo size="titlebar"/>
      </div>
      <TitleBarAppMenu/>
    </div>

    <!-- IDEA: 连续工具条 — 项目控件 + 模块控件同族 -->
    <div class="desktop-titlebar__toolbar">
      <WorkspaceSwitcher @dblclick-drag="toggleMaximize"/>
      <DesktopTitleBarMenu
          class="desktop-titlebar__nav"
          @dblclick-drag="toggleMaximize"
      />
    </div>

    <div
        class="desktop-titlebar__drag"
        @pointerdown="beginFramelessWindowDrag"
        @dblclick.stop="toggleMaximize"
    />

    <TitleBarQuickActions/>

    <div v-if="!isMac" class="desktop-titlebar__controls">
      <button
          type="button"
          class="desktop-titlebar__btn"
          :aria-label="t('app.titleBar.minimize')"
          @click="minimize"
      >
        <DwIcon name="minus" size="xs" :stroke-width="1.2"/>
      </button>
      <button
          type="button"
          class="desktop-titlebar__btn"
          :aria-label="maximized ? t('app.titleBar.restore') : t('app.titleBar.maximize')"
          @click="toggleMaximize"
      >
        <DwIcon v-if="!maximized" name="fullscreen" size="xs" :stroke-width="1.1"/>
        <DwIcon v-else name="fullscreen" active size="xs" :stroke-width="1.1"/>
      </button>
      <button
          type="button"
          class="desktop-titlebar__btn desktop-titlebar__btn--close"
          :aria-label="t('app.titleBar.close')"
          @click="onClose"
      >
        <DwIcon name="x" size="xs" :stroke-width="1.2"/>
      </button>
    </div>
  </header>

  <WorkspaceActionDialogs/>

  <ConfirmDialog
      :open="exitConfirm.open.value"
      :title="exitConfirm.title.value"
      :message="exitConfirm.message.value"
      :confirm-label="exitConfirm.confirmLabel.value"
      :confirm-variant="exitConfirm.confirmVariant.value"
      @update:open="exitConfirm.onOpenUpdate"
      @confirm="exitConfirm.onConfirm"
  />
</template>

<style scoped>
.desktop-titlebar {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  min-width: 0;
  height: var(--dw-titlebar-height);
  gap: 2px;
  padding: 0 0 0 2px;
  background: var(--dw-bg-chrome);
  position: relative;
  z-index: var(--dw-z-toolbar);
  user-select: none;
}

.desktop-titlebar--mac {
  padding-left: 72px;
}

.desktop-titlebar__brand {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: 100%;
  gap: 2px;
  -webkit-app-region: no-drag;
}

.desktop-titlebar__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  height: 100%;
  padding: 0 4px 0 10px;
  -webkit-app-region: drag;
}

/* 项目 + 模块：同一工具条节奏，无竖分割线 */
.desktop-titlebar__toolbar {
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  gap: 2px;
  padding: 0 4px;
  -webkit-app-region: no-drag;
}

.desktop-titlebar__nav {
  flex: 1 1 auto;
  min-width: 0;
}

.desktop-titlebar__drag {
  flex: 0 1 24px;
  min-width: 8px;
  height: 100%;
  -webkit-app-region: drag;
}

.desktop-titlebar__controls {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  height: 100%;
  padding: 0 6px 0 2px;
  -webkit-app-region: no-drag;
}

.desktop-titlebar__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: var(--dw-density-sm);
  border: none;
  border-radius: var(--dw-titlebar-chip-radius);
  background: transparent;
  color: var(--dw-text-secondary);
  cursor: pointer;
  transition: background 100ms ease, color 100ms ease;
}

.desktop-titlebar__btn:hover {
  background: var(--dw-titlebar-chip-hover);
  color: var(--dw-text);
}

.desktop-titlebar__btn--close:hover {
  background: var(--dw-danger);
  color: var(--dw-on-accent);
}

.desktop-titlebar__btn svg {
  width: 12px;
  height: 12px;
}
</style>
