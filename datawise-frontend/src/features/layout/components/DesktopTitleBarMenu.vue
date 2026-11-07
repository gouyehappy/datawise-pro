<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue'
import {storeToRefs} from 'pinia'
import {useI18n} from 'vue-i18n'
import {usePopoverEscape} from '@/core/composables/usePopoverEscape'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useDockPlacementStore} from '@/features/dock/stores/dock-placement-store'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {
    buildTitleBarNav,
    titleBarMenuIsDropdown,
    type TitleBarMenuItem,
} from '@/features/layout/services/title-bar-nav.service'
import TitleBarMenuIcon from '@/features/layout/components/TitleBarMenuIcon.vue'
import {DwIcon} from '@/core/icons'
import {useTitleBarMenuDensity} from '@/features/layout/composables/useTitleBarMenuDensity'
import {beginFramelessWindowDrag} from '@/features/layout/composables/useDesktopTitleBar'
import {useOnboardingStore} from '@/features/onboarding/stores/onboarding-store'
import {
    canOpenConnectionCatalogForm,
    getActiveFeaturePermissions,
} from '@/features/auth/services/feature-permission.service'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useDatasourceCatalogStore} from '@/features/datasource/stores/datasource-catalog'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import DbTypeContextPanel from '@/features/explorer/components/DbTypeContextPanel.vue'
import type {DbType} from '@/core/types'

const {t, te} = useI18n()
const layout = useLayoutStore()
const workspace = useWorkspaceStore()
const catalog = useDatasourceCatalogStore()
const auth = useAuthStore()
const appConfig = useAppConfigStore()
const entitlement = useEntitlementStore()
const onboarding = useOnboardingStore()
const {
    showSideRailStrip,
    showExplorerPanel,
    showShortcutRailStrip,
} = storeToRefs(appConfig)

function setModuleGuarded(module: Parameters<typeof layout.setModule>[0]): void {
    if (module === 'ai' && !entitlement.guardAiNav()) return
    layout.setModule(module)
}

function toggleSideRailStrip() {
    appConfig.setShowSideRailStrip(!appConfig.showSideRailStrip)
}

function toggleExplorerPanel() {
    const next = !appConfig.showExplorerPanel
    appConfig.setShowExplorerPanel(next)
    if (next && layout.activeModule !== 'database' && layout.activeModule !== 'ai') {
        layout.showWarningToast(t('app.titleBar.menu.configQuick.explorerOnlyInWorkbench'))
    }
}

function toggleShortcutRailStrip() {
    const dock = useDockPlacementStore()
    if (appConfig.showShortcutRailStrip && dock.shortcutSide === 'float') {
        appConfig.setDockPlacement({...dock.placement, shortcut: 'right'})
        return
    }
    const next = !appConfig.showShortcutRailStrip
    appConfig.setShowShortcutRailStrip(next)
    if (next && !appConfig.showShortcutRail) {
        layout.showWarningToast(t('app.titleBar.menu.configQuick.rightSidebarEmpty'))
    }
}

/** Run after the dropdown unmounts so JCEF/Vue don't double-fire on a patched checkbox row. */
function runConfigAction(id: string, fallback?: () => void) {
    switch (id) {
        case 'config:side-rail':
            toggleSideRailStrip()
            return
        case 'config:explorer':
            toggleExplorerPanel()
            return
        case 'config:shortcut-rail':
            toggleShortcutRailStrip()
            return
        case 'config:focus-mode':
            appConfig.applyFocusMode()
            return
        default:
            fallback?.()
    }
}

function openNewConnectionPicker() {
    if (!canOpenConnectionCatalogForm(auth.isGuest)) {
        layout.showErrorToast(t('auth.permissionDenied'))
        return
    }
    layout.setModule('database')
    void catalog.ensureLoaded().catch(() => undefined)
}

function openNewConsole() {
    layout.setModule('database')
    workspace.openConsole()
}

function onPickDbType(dbType: DbType) {
    closeMenu()
    workspace.openConnectionForm(dbType)
}

const openMenuId = ref<string | null>(null)
const rootRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)
const dropdownPanelRef = ref<HTMLElement | null>(null)
const dropdownPlacement = ref<{top: number; left: number} | null>(null)

const menus = computed(() => {
    getActiveFeaturePermissions()
    return buildTitleBarNav(
        {
            activeModule: layout.activeModule,
            settingsSection: layout.settingsSection,
            communityPluginCenterActive: workspace.activeTab?.type === 'community-plugin-center',
            config: {
                showSideRailStrip: showSideRailStrip.value,
                showExplorerPanel: showExplorerPanel.value,
                showShortcutRailStrip: showShortcutRailStrip.value,
            },
        },
        {
            setModule: setModuleGuarded,
            openSettings: (section) => layout.openSettingsModule(section ?? 'basic'),
            openOnboarding: () => onboarding.showGuide(),
            openRuntimeSetup: () => onboarding.showRuntimeSetup(),
            openNewConnection: openNewConnectionPicker,
            openNewConsole,
            config: {
                openPreferences: () => layout.openSettingsModule('basic'),
                toggleSideRailStrip,
                toggleExplorerPanel,
                toggleShortcutRailStrip,
                applyFocusMode: () => appConfig.applyFocusMode(),
            },
        },
    )
})

const menuLayoutStats = computed(() => ({
    primaryCount: menus.value.length,
    contextItemCount: 0,
    contextGroupCount: 0,
}))

const remeasureKey = computed(() => `${layout.activeModule}:${menus.value.length}`)

const {density} = useTitleBarMenuDensity(rootRef, contentRef, menuLayoutStats, remeasureKey)

const openDropdownMenu = computed(() =>
    menus.value.find((item) => item.id === openMenuId.value && titleBarMenuIsDropdown(item)) ?? null,
)

const isConnectionPickerOpen = computed(() => openDropdownMenu.value?.id === 'new-connection')

const dropdownStyle = computed(() => {
    const placement = dropdownPlacement.value
    if (!placement) return undefined
    return {
        top: `${placement.top}px`,
        left: `${placement.left}px`,
    }
})

usePopoverEscape(
    () => openMenuId.value !== null,
    () => {
        closeMenu()
    },
    {closeOnOutside: false},
)

function labelOf(item: TitleBarMenuItem): string {
    if (!item.labelKey) return ''
    return te(item.labelKey) ? t(item.labelKey) : item.labelKey
}

function closeMenu() {
    openMenuId.value = null
    dropdownPlacement.value = null
}

function setDropdownPlacement(button: HTMLElement) {
    const rect = button.getBoundingClientRect()
    dropdownPlacement.value = {
        top: rect.bottom + 5,
        left: rect.left,
    }
}

function toggleMenu(item: TitleBarMenuItem, event: MouseEvent) {
    if (titleBarMenuIsDropdown(item)) {
        if (openMenuId.value === item.id) {
            closeMenu()
            return
        }
        if (item.id === 'new-connection') {
            item.run?.()
        }
        openMenuId.value = item.id
        setDropdownPlacement(event.currentTarget as HTMLElement)
        return
    }
    item.run?.()
    closeMenu()
}

function selectChild(item: TitleBarMenuItem) {
    if (!item.run && !item.id.startsWith('config:')) return
    const id = item.id
    const fallback = item.run
    try {
        runConfigAction(id, fallback)
    } finally {
        closeMenu()
    }
}

function onDocumentMouseDown(event: MouseEvent) {
    if (!openMenuId.value) return
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest('.titlebar-menu__dropdown')) return
    if (rootRef.value?.contains(target)) return
    closeMenu()
}

function onWindowResize() {
    if (openMenuId.value) closeMenu()
}

onMounted(() => {
    document.addEventListener('mousedown', onDocumentMouseDown)
    window.addEventListener('resize', onWindowResize)
})

onUnmounted(() => {
    document.removeEventListener('mousedown', onDocumentMouseDown)
    window.removeEventListener('resize', onWindowResize)
})
</script>

<template>
  <nav
      ref="rootRef"
      class="titlebar-menu"
      :class="`titlebar-menu--${density}`"
      :aria-label="t('app.titleBar.menu.label')"
  >
    <div ref="contentRef" class="titlebar-menu__content">
      <template v-for="(item, index) in menus" :key="item.id">
        <div
            v-if="index > 0 && item.id === 'config'"
            class="titlebar-menu__sep"
            aria-hidden="true"
        />
        <div
            class="titlebar-menu__item"
            :class="{
              'is-open': openMenuId === item.id,
              'is-active': item.active,
              'is-primary': item.primary,
            }"
        >
          <button
              type="button"
              class="titlebar-menu__btn"
              :class="{
                'is-active': item.active,
                'has-children': titleBarMenuIsDropdown(item),
                'is-primary': item.primary,
              }"
              :aria-expanded="titleBarMenuIsDropdown(item) ? openMenuId === item.id : undefined"
              :title="labelOf(item)"
              @click="toggleMenu(item, $event)"
          >
            <TitleBarMenuIcon v-if="item.icon" :name="item.icon" size="sm" class="titlebar-menu__btn-icon"/>
            <span class="titlebar-menu__btn-label">{{ labelOf(item) }}</span>
            <span v-if="item.badge" class="titlebar-menu__badge">{{ item.badge }}</span>
            <DwIcon
                v-if="titleBarMenuIsDropdown(item)"
                class="titlebar-menu__caret"
                name="chevron-down"
                size="xs"
                :stroke-width="1.3"
            />
          </button>
        </div>
      </template>
    </div>

    <div
        class="titlebar-menu__drag"
        aria-hidden="true"
        @pointerdown="beginFramelessWindowDrag"
        @dblclick="$emit('dblclick-drag')"
    />

    <Teleport to="body">
      <Transition name="titlebar-dropdown">
        <div
            v-if="openDropdownMenu"
            :key="openDropdownMenu.id"
            ref="dropdownPanelRef"
            class="titlebar-menu__dropdown titlebar-menu__dropdown--fixed"
            :class="{'titlebar-menu__dropdown--picker': isConnectionPickerOpen}"
            :style="dropdownStyle"
            role="menu"
            @mousedown.stop
            @pointerdown.stop
        >
          <template v-if="isConnectionPickerOpen">
            <div class="titlebar-menu__picker-head">
              {{ t('app.titleBar.menu.pickDbType') }}
            </div>
            <DbTypeContextPanel @select="onPickDbType"/>
          </template>
          <div v-else class="titlebar-menu__dropdown-body">
            <template v-for="child in openDropdownMenu.children" :key="child.id">
              <div
                  v-if="child.kind === 'header'"
                  class="titlebar-menu__dropdown-group"
              >
                {{ labelOf(child) }}
              </div>
              <div
                  v-else-if="child.divider"
                  class="titlebar-menu__dropdown-divider"
                  role="separator"
              />
              <button
                  v-else
                  type="button"
                  class="titlebar-menu__dropdown-item"
                  :class="{'is-active': child.active, 'is-checked': child.checked}"
                  role="menuitemcheckbox"
                  :aria-checked="child.checked ? 'true' : 'false'"
                  @mousedown.stop
                  @click.stop.prevent="selectChild(child)"
              >
                <span class="titlebar-menu__dropdown-leading" aria-hidden="true">
                  <TitleBarMenuIcon v-if="child.icon" :name="child.icon" size="md"/>
                </span>
                <span class="titlebar-menu__dropdown-copy">
                  <span class="titlebar-menu__dropdown-label">{{ labelOf(child) }}</span>
                </span>
                <span v-if="child.checked" class="titlebar-menu__dropdown-check" aria-hidden="true">?</span>
              </button>
            </template>
          </div>
        </div>
      </Transition>
    </Teleport>
  </nav>
</template>

<style scoped>
.titlebar-menu {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  height: 100%;
  gap: 2px;
  padding: 0;
  overflow: hidden;
  -webkit-app-region: no-drag;
}

.titlebar-menu__content {
  display: flex;
  align-items: center;
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
  gap: 1px;
  overflow: hidden;
}

.titlebar-menu__sep {
  width: 1px;
  height: 16px;
  margin: 0 4px;
  background: color-mix(in srgb, var(--dw-text) 12%, transparent);
  flex-shrink: 0;
}

.titlebar-menu__item {
  position: relative;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: 100%;
}

.titlebar-menu__item.is-open .titlebar-menu__btn {
  background: var(--dw-titlebar-chip-active);
  color: var(--dw-text);
}

.titlebar-menu__btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: var(--dw-density-sm);
  padding: 0 8px;
  border: none;
  border-radius: var(--dw-titlebar-chip-radius);
  background: transparent;
  color: var(--dw-text-secondary);
  font-size: var(--dw-font-size-titlebar);
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: background 100ms ease, color 100ms ease;
}

.titlebar-menu__btn.has-children {
  padding-right: 6px;
}

.titlebar-menu__btn.is-primary {
  color: var(--dw-text);
  font-weight: 600;
}

.titlebar-menu__btn:hover,
.titlebar-menu__item.is-open .titlebar-menu__btn:hover {
  background: var(--dw-titlebar-chip-hover);
  color: var(--dw-text);
}

.titlebar-menu__btn.is-active {
  background: color-mix(in srgb, var(--dw-primary) 12%, transparent);
  color: var(--dw-text);
  box-shadow: none;
}

.titlebar-menu__btn-icon {
  opacity: 0.88;
}

.titlebar-menu__btn.is-active .titlebar-menu__btn-icon,
.titlebar-menu__btn.is-primary .titlebar-menu__btn-icon {
  opacity: 1;
}

.titlebar-menu__caret {
  width: 11px;
  height: 11px;
  opacity: 0.5;
  transition: transform 140ms ease;
}

.titlebar-menu__item.is-open .titlebar-menu__caret {
  transform: rotate(180deg);
}

.titlebar-menu__dropdown {
  min-width: 220px;
  max-width: 300px;
  border: 1px solid var(--dw-menu-border);
  border-radius: var(--dw-menu-radius);
  background: var(--dw-bg-panel);
  box-shadow: var(--dw-menu-shadow);
  overflow: hidden;
}

.titlebar-menu__dropdown--picker {
  min-width: min(560px, 92vw);
  max-width: min(640px, 94vw);
  max-height: min(70vh, 560px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.titlebar-menu__dropdown--picker :deep(.db-type-panel),
.titlebar-menu__dropdown--picker :deep(.db-type-context-panel) {
  flex: 1;
  min-height: 280px;
  max-height: min(62vh, 500px);
}

.titlebar-menu__picker-head {
  flex-shrink: 0;
  padding: 10px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--dw-text) 8%, transparent);
  font-size: var(--dw-font-size-titlebar);
  font-weight: 600;
  color: var(--dw-text-secondary);
}

.titlebar-menu__dropdown--fixed {
  position: fixed;
  z-index: var(--dw-z-window);
  -webkit-app-region: no-drag;
}

.titlebar-menu--nav-compact .titlebar-menu__btn-label {
  display: none;
}

.titlebar-menu--nav-compact .titlebar-menu__item.is-primary .titlebar-menu__btn-label {
  display: inline;
}

.titlebar-menu--nav-compact .titlebar-menu__btn {
  padding: 0 var(--dw-space-3);
}

.titlebar-menu--nav-compact .titlebar-menu__btn.has-children {
  padding-right: 5px;
}

.titlebar-menu__dropdown-body {
  max-height: min(420px, 52vh);
  overflow-y: auto;
  padding: var(--dw-menu-pad-y) var(--dw-menu-pad-x);
}

.titlebar-menu__dropdown-group {
  padding: 8px 10px 4px var(--dw-menu-gutter);
  font-size: var(--dw-font-size-menu-caption);
  font-weight: 600;
  letter-spacing: 0.01em;
  text-transform: none;
  color: var(--dw-text-muted);
}

.titlebar-menu__dropdown-group:not(:first-child) {
  padding-top: 10px;
}

.titlebar-menu__dropdown-divider {
  height: 1px;
  margin: 4px 8px;
  background: color-mix(in srgb, var(--dw-text) 8%, transparent);
}

.titlebar-menu__dropdown-item {
  display: grid;
  grid-template-columns: var(--dw-menu-gutter) minmax(0, 1fr) auto;
  align-items: center;
  gap: 0;
  width: 100%;
  min-height: var(--dw-menu-item-h);
  padding: 0 8px 0 0;
  border: none;
  border-radius: var(--dw-menu-item-radius);
  background: transparent;
  color: var(--dw-text);
  text-align: left;
  cursor: pointer;
  transition: background 100ms ease, color 100ms ease;
}

.titlebar-menu__dropdown-item:hover {
  background: var(--dw-menu-active);
  color: var(--dw-text);
}

.titlebar-menu__dropdown-item.is-active {
  background: var(--dw-menu-active);
  color: var(--dw-text);
}

.titlebar-menu__dropdown-leading {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--dw-menu-gutter);
  height: var(--dw-menu-item-h);
}

.titlebar-menu__dropdown-copy {
  min-width: 0;
}

.titlebar-menu__dropdown-label {
  font-size: var(--dw-font-size-menu);
  font-weight: 400;
  line-height: var(--dw-leading-tight);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.titlebar-menu__dropdown-item.is-checked {
  color: var(--dw-text);
}

.titlebar-menu__dropdown-check {
  margin-right: 4px;
  font-size: var(--dw-font-size-menu-caption);
  font-weight: 700;
  color: var(--dw-primary);
}

.titlebar-menu__dropdown-item.is-active .titlebar-menu__dropdown-label {
  font-weight: 500;
}

.titlebar-menu__drag {
  flex: 1 1 0;
  min-width: 12px;
  height: 100%;
  -webkit-app-region: drag;
}

.titlebar-menu__badge {
  min-width: var(--dw-icon-size-sm);
  height: var(--dw-icon-size-sm);
  padding: 0 var(--dw-space-2);
  border-radius: var(--dw-radius-pill);
  background: color-mix(in srgb, var(--dw-warning) 18%, transparent);
  color: var(--dw-warning);
  font-size: var(--dw-text-2xs);
  font-weight: 700;
  line-height: var(--dw-tab-title-line);
  flex-shrink: 0;
}

.titlebar-dropdown-enter-active,
.titlebar-dropdown-leave-active {
  transition: opacity var(--dw-duration) var(--dw-ease), transform var(--dw-duration) var(--dw-ease);
}

.titlebar-dropdown-enter-from,
.titlebar-dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
