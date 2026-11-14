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
import {useConfirmDialog} from '@/core/composables/useConfirmDialog'
import {useLocalFilesUnsavedExitGuard} from '@/features/local-files/composables/useLocalFilesUnsavedExitGuard'
import {confirmLocalFilesExitIfNeeded} from '@/features/local-files/services/local-files-exit-guard'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'

const {t} = useI18n()
const {visible, maximized, isMac, minimize, toggleMaximize, close, beginFramelessWindowDrag} = useDesktopTitleBar()
const appConfig = useAppConfigStore()

function resolveExitConfirm() {
  try {
    return useLocalFilesUnsavedExitGuard()
  } catch (error) {
    console.warn('[titlebar] exit guard unavailable', error)
    return useConfirmDialog('danger')
  }
}

const {
  open: exitOpen,
  title: exitTitle,
  message: exitMessage,
  confirmLabel: exitConfirmLabel,
  confirmVariant: exitConfirmVariant,
  onOpenUpdate: onExitOpenUpdate,
  onConfirm: onExitConfirm,
} = resolveExitConfirm()

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

    <TitleBarQuickActions class="desktop-titlebar__quick"/>

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
      :open="exitOpen"
      :title="exitTitle"
      :message="exitMessage"
      :confirm-label="exitConfirmLabel"
      :confirm-variant="exitConfirmVariant"
      @update:open="onExitOpenUpdate"
      @confirm="onExitConfirm"
  />
</template>

<style scoped>
.desktop-titlebar {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  min-width: 0;
  height: var(--dw-titlebar-height);
  gap: 6px;
  padding: 0 2px 0 8px;
  /*
   * 配色全部交给 --dw-titlebar-*：浅色 / 深色各一套中性灰，再混入当前
   * data-bg-tone 的色调；四种界面款式各自决定混合比、渐变强度与控件高
   * （见 packages/tokens/src/skins/*.css）。不再一个 color-mix 公式通吃。
   * 左侧 36% 的低饱和主色渐变对应 IDEA 的 project-color header，不铺满整条。
   */
  background:
    linear-gradient(90deg, var(--dw-titlebar-tint) 0, transparent 36%),
    var(--dw-titlebar-bg);
  box-shadow: inset 0 -1px 0 var(--dw-titlebar-seam);
  color: var(--dw-titlebar-fg);
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
  gap: 4px;
  -webkit-app-region: no-drag;
}

.desktop-titlebar__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  height: 100%;
  padding: 0 6px 0 2px;
  -webkit-app-region: drag;
}

/* 项目 + 上下文：同一工具条节奏，无竖分割线 */
.desktop-titlebar__toolbar {
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  gap: 6px;
  padding: 0 2px;
  -webkit-app-region: no-drag;
}

.desktop-titlebar__nav {
  flex: 1 1 auto;
  min-width: 0;
}

.desktop-titlebar__drag {
  flex: 0 0 4px;
  min-width: 4px;
  height: 100%;
  -webkit-app-region: drag;
}

/* 通用图标组与窗口控件之间靠留白分组，不画竖线（IDEA 原则） */
.desktop-titlebar__quick {
  margin-left: 6px;
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
  height: var(--dw-titlebar-widget-h);
  border: none;
  border-radius: var(--dw-titlebar-chip-radius);
  background: transparent;
  color: var(--dw-titlebar-fg);
  cursor: pointer;
  transition: background 100ms ease, color 100ms ease;
}

.desktop-titlebar__btn:hover {
  background: var(--dw-titlebar-chip-hover);
  color: var(--dw-titlebar-fg-strong);
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
