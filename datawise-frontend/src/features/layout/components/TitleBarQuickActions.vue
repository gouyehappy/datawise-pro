<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useThemeStore} from '@/features/settings/stores/theme-store'
import {useUpdateSettingsStore} from '@/features/settings/stores/update-settings'

/**
 * IDEA 顶栏最右只保留两个常驻通用图标：外观、设置。
 * 检查更新 / GitHub / 锁屏 / AI 已归到顶栏「⋯」面板，不再与菜单重复占位。
 */
const {t} = useI18n()
const layout = useLayoutStore()
const theme = useThemeStore()
const updateSettings = useUpdateSettingsStore()

const hasUpdate = computed(() => Boolean(updateSettings.lastCheck?.hasUpdate))
const themeIcon = computed(() => (theme.resolvedMode === 'dark' ? 'sun' : 'moon'))
const themeTitle = computed(() =>
    theme.resolvedMode === 'dark'
        ? t('app.titleBar.quick.themeLight')
        : t('app.titleBar.quick.themeDark'),
)

function onToggleTheme() {
  theme.toggleMode()
}

function onOpenSettings() {
  layout.openSettingsModule('basic')
}
</script>

<template>
  <div class="titlebar-quick" role="toolbar" :aria-label="t('app.titleBar.quick.label')">
    <button
        type="button"
        class="titlebar-quick__btn"
        :title="themeTitle"
        :aria-label="themeTitle"
        @click="onToggleTheme"
    >
      <DwIcon :name="themeIcon" size="md" :stroke-width="1.8"/>
    </button>
    <button
        type="button"
        class="titlebar-quick__btn"
        :title="t('app.titleBar.quick.settings')"
        :aria-label="t('app.titleBar.quick.settings')"
        @click="onOpenSettings"
    >
      <DwIcon name="settings" size="md" :stroke-width="1.8"/>
      <span v-if="hasUpdate" class="titlebar-quick__badge" aria-hidden="true"/>
    </button>
  </div>
</template>

<style scoped>
.titlebar-quick {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  height: 100%;
  padding: 0;
  -webkit-app-region: no-drag;
}

.titlebar-quick__btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: var(--dw-titlebar-widget-h);
  margin: 0;
  padding: 0;
  border: none;
  border-radius: var(--dw-titlebar-chip-radius);
  background: transparent;
  color: var(--dw-titlebar-fg);
  cursor: pointer;
  transition: background 100ms ease, color 100ms ease;
}

.titlebar-quick__btn :deep(.dw-icon-root) {
  --dw-icon-size: 18px;
  width: 18px;
  height: 18px;
  shape-rendering: geometricPrecision;
}

.titlebar-quick__btn:hover:not(:disabled) {
  background: var(--dw-titlebar-chip-hover);
  color: var(--dw-titlebar-fg-strong);
}

.titlebar-quick__badge {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dw-danger);
  box-shadow: 0 0 0 1px var(--dw-titlebar-bg);
}
</style>
