<script setup lang="ts">
import {computed, onUnmounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {EmptyState} from '@/core/components'
import {DwIcon, ensureDeferredDwIcons} from '@/core/icons'

void ensureDeferredDwIcons()
import {usePopoverEscape} from '@/core/composables/usePopoverEscape'
import {useShortcutSettingsStore} from '@/features/settings/stores/shortcut-settings-store'
import {formatBinding} from '@/core/shortcuts/shortcut.service'
import {useWorkspaceActions} from '@/features/layout/composables/useWorkspaceActions'
import {
    useTitleBarAuthMenuItems,
    useTitleBarPreferenceMenuItems,
} from '@/features/layout/composables/useProfileMenuGroups'
import {useFeaturePermission} from '@/features/auth/composables/useFeaturePermission'
import {FeaturePermission} from '@/features/auth/types/feature-permission.types'
import type {WorkspaceListEntry} from '@/features/settings/services/config-dir-settings.service'
import {confirmLocalFilesExitIfNeeded} from '@/features/local-files/services/local-files-exit-guard'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'

const props = defineProps<{
  menuStyle?: {top: string; left: string}
}>()

const emit = defineEmits<{ close: [] }>()

const rootRef = ref<HTMLElement | null>(null)
const recentSubmenuRef = ref<HTMLElement | null>(null)

const {t} = useI18n()
const shortcuts = useShortcutSettingsStore()
const {
    canSwitch,
    recentWorkspaces,
    activeEntry,
    displayName,
    createWorkspace,
    openFolder,
    confirmSwitch,
    useDefaultWorkspace,
    dismissRecent,
} = useWorkspaceActions()
const {can} = useFeaturePermission()

const recentOpen = ref(false)
const recentRemoving = ref(false)
let recentCloseTimer: ReturnType<typeof setTimeout> | null = null

usePopoverEscape(recentOpen, () => {
  recentOpen.value = false
}, {
  containRefs: () => [recentSubmenuRef.value],
})

function clearRecentCloseTimer() {
  if (!recentCloseTimer) return
  clearTimeout(recentCloseTimer)
  recentCloseTimer = null
}

function onRecentEnter() {
  clearRecentCloseTimer()
  recentOpen.value = true
}

function onRecentLeave() {
  clearRecentCloseTimer()
  recentCloseTimer = setTimeout(() => {
    recentOpen.value = false
    recentCloseTimer = null
  }, 250)
}

onUnmounted(() => {
  clearRecentCloseTimer()
})

const settingsShortcut = computed(() => formatBinding(shortcuts.getBinding('app.openSettings')))
const lockShortcut = computed(() => formatBinding(shortcuts.getBinding('app.lockScreen')))

const recentEntries = computed(() => recentWorkspaces.value.filter((entry) => !entry.active))

const showDefaultWorkspace = computed(() => {
    const active = activeEntry()
    if (!active || active.isDefault || !canSwitch.value) return false
    // Default already appears in the recent list — no need for a duplicate footer CTA.
    return !recentEntries.value.some((entry) => entry.isDefault)
})

const sectionVisible = computed(() => ({
    workspace: canSwitch.value && can(FeaturePermission.TitleBarWorkspace),
    preferences: preferenceMenuItems.value.length > 0,
    auth: authMenuItems.value.length > 0,
    exit: true,
}))

const visibleSections = computed(() =>
    (['workspace', 'preferences', 'auth', 'exit'] as const).filter((id) => sectionVisible.value[id]),
)

function showSectionDivider(sectionId: (typeof visibleSections.value)[number]) {
    return visibleSections.value.indexOf(sectionId) > 0
}

function closeMenu() {
    recentOpen.value = false
    emit('close')
}

const preferenceMenuItems = useTitleBarPreferenceMenuItems(closeMenu, () => {}, {tier: 'primary'})
const authMenuItems = useTitleBarAuthMenuItems(closeMenu)

async function exitApp() {
    if (!(await confirmLocalFilesExitIfNeeded())) return
    await useAppConfigStore().flushWorkspaceSessionOnExitAsync()
    void window.datawise?.chrome?.close()
    closeMenu()
}

function onSelectRecent(entry: WorkspaceListEntry) {
    recentOpen.value = false
    confirmSwitch(entry)
    closeMenu()
}

async function onRemoveRecent(entry: WorkspaceListEntry, event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    if (recentRemoving.value || entry.active) return
    recentRemoving.value = true
    try {
        await dismissRecent(entry)
    } finally {
        recentRemoving.value = false
    }
}

function onCreateWorkspace() {
    createWorkspace()
    closeMenu()
}

function onOpenFolder() {
    void openFolder().finally(() => closeMenu())
}

function onUseDefault() {
    useDefaultWorkspace()
    closeMenu()
}

defineExpose({
    containsNode(target: Node): boolean {
        return rootRef.value?.contains(target) ?? false
    },
})
</script>

<template>
  <div
      ref="rootRef"
      class="titlebar-main-menu"
      :class="{ 'titlebar-main-menu--anchored': !!props.menuStyle }"
      :style="props.menuStyle"
      @click.stop
  >
    <section v-if="sectionVisible.workspace" class="titlebar-main-menu__section">
      <button type="button" class="titlebar-main-menu__item" @click="onCreateWorkspace">
        <span class="titlebar-main-menu__icon" aria-hidden="true">
          <DwIcon name="plus" size="menu" :stroke-width="1.9"/>
        </span>
        <span class="titlebar-main-menu__label">{{ t('app.titleBar.mainMenu.newWorkspace') }}</span>
      </button>

      <button type="button" class="titlebar-main-menu__item" @click="onOpenFolder">
        <span class="titlebar-main-menu__icon" aria-hidden="true">
          <DwIcon name="open" size="menu" :stroke-width="1.9"/>
        </span>
        <span class="titlebar-main-menu__label">{{ t('app.titleBar.mainMenu.openFolder') }}</span>
      </button>

      <div
          ref="recentSubmenuRef"
          class="titlebar-main-menu__submenu"
          @mouseenter="onRecentEnter"
          @mouseleave="onRecentLeave"
      >
        <button
            type="button"
            class="titlebar-main-menu__item"
            :class="{ 'is-open': recentOpen }"
            :aria-expanded="recentOpen"
            @click="recentOpen = !recentOpen"
        >
          <span class="titlebar-main-menu__icon" aria-hidden="true">
            <DwIcon name="history" size="menu" :stroke-width="1.9"/>
          </span>
          <span class="titlebar-main-menu__label">{{ t('app.titleBar.mainMenu.recentWorkspaces') }}</span>
          <DwIcon class="titlebar-main-menu__arrow" name="chevron-right" size="xs" :stroke-width="1.75"/>
        </button>

        <div
            v-if="recentOpen"
            class="titlebar-main-menu__flyout"
            role="menu"
            :aria-label="t('app.titleBar.mainMenu.recentWorkspaces')"
        >
          <div
              v-for="entry in recentEntries"
              :key="entry.path"
              class="titlebar-main-menu__item titlebar-main-menu__item--split"
          >
            <button
                type="button"
                class="titlebar-main-menu__item-main"
                role="menuitem"
                :title="entry.path"
                @click="onSelectRecent(entry)"
            >
              <span class="titlebar-main-menu__icon" aria-hidden="true">
                <DwIcon name="folder" size="menu" :stroke-width="1.9"/>
              </span>
              <span class="titlebar-main-menu__label">{{ displayName(entry) }}</span>
            </button>
            <button
                type="button"
                class="titlebar-main-menu__item-action"
                :title="t('app.titleBar.workspaceSwitcher.removeRecent')"
                :aria-label="t('app.titleBar.workspaceSwitcher.removeRecent')"
                :disabled="recentRemoving"
                @click="onRemoveRecent(entry, $event)"
            >
              <DwIcon name="delete" size="xs" :stroke-width="1.9"/>
            </button>
          </div>
          <EmptyState
              v-if="!recentEntries.length"
              embedded
              compact
              class="titlebar-main-menu__empty"
              :title="t('app.titleBar.mainMenu.recentEmpty')"
          />
          <button
              v-if="showDefaultWorkspace"
              type="button"
              class="titlebar-main-menu__item"
              role="menuitem"
              @click="onUseDefault"
          >
            <span class="titlebar-main-menu__icon" aria-hidden="true">
              <DwIcon name="submit" size="menu" :stroke-width="1.9"/>
            </span>
            <span class="titlebar-main-menu__label">{{ t('app.titleBar.workspaceSwitcher.useDefault') }}</span>
          </button>
        </div>
      </div>
    </section>

    <div v-if="showSectionDivider('preferences')" class="titlebar-main-menu__divider"/>

    <section v-if="sectionVisible.preferences" class="titlebar-main-menu__section">
      <button
          v-for="item in preferenceMenuItems"
          :key="item.id"
          type="button"
          class="titlebar-main-menu__item"
          :class="{'titlebar-main-menu__item--accent': item.accent}"
          @click="item.onClick"
      >
        <span class="titlebar-main-menu__icon" aria-hidden="true">
          <DwIcon :name="item.icon" size="menu" :stroke-width="item.icon === 'users' ? 1.75 : 1.9"/>
        </span>
        <span class="titlebar-main-menu__label">{{ t(item.labelKey) }}</span>
        <kbd v-if="item.id === 'settings' && settingsShortcut" class="titlebar-main-menu__shortcut">{{ settingsShortcut }}</kbd>
      </button>
    </section>

    <div v-if="showSectionDivider('auth')" class="titlebar-main-menu__divider"/>

    <section v-if="sectionVisible.auth" class="titlebar-main-menu__section">
      <button
          v-for="item in authMenuItems"
          :key="item.id"
          type="button"
          class="titlebar-main-menu__item"
          :class="{'titlebar-main-menu__item--accent': item.accent}"
          :data-testid="item.id === 'team' ? 'profile-menu-team' : undefined"
          @click="item.onClick"
      >
        <span class="titlebar-main-menu__icon" aria-hidden="true">
          <DwIcon :name="item.icon" size="menu" :stroke-width="item.icon === 'users' ? 1.75 : 1.9"/>
        </span>
        <span class="titlebar-main-menu__label">{{ t(item.labelKey) }}</span>
        <kbd v-if="item.id === 'lock-screen' && lockShortcut" class="titlebar-main-menu__shortcut">{{ lockShortcut }}</kbd>
        <span v-if="item.badgeKey" class="titlebar-main-menu__badge">{{ t(item.badgeKey) }}</span>
      </button>
    </section>

    <div v-if="showSectionDivider('exit')" class="titlebar-main-menu__divider"/>

    <section v-if="sectionVisible.exit" class="titlebar-main-menu__section">
      <button type="button" class="titlebar-main-menu__item" @click="exitApp">
        <span class="titlebar-main-menu__icon" aria-hidden="true"/>
        <span class="titlebar-main-menu__label">{{ t('app.titleBar.mainMenu.exit') }}</span>
      </button>
    </section>
  </div>
</template>

<style scoped>
.titlebar-main-menu {
  position: fixed;
  left: calc(var(--dw-rail-width) + 8px);
  top: 10px;
  z-index: var(--dw-z-max);
  width: min(300px, calc(100vw - 24px));
  padding: var(--dw-menu-pad-y) var(--dw-menu-pad-x);
  border: 1px solid var(--dw-menu-border);
  border-radius: var(--dw-menu-radius);
  background: var(--dw-bg-panel);
  box-shadow: var(--dw-menu-shadow);
}

.titlebar-main-menu--anchored {
  left: auto;
  top: auto;
}

.titlebar-main-menu__section {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 2px 0;
}

.titlebar-main-menu__divider {
  height: 1px;
  margin: 4px 8px;
  background: color-mix(in srgb, var(--dw-text) 8%, transparent);
}

.titlebar-main-menu__item {
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
  font-size: var(--dw-font-size-menu);
  font-weight: 400;
  text-align: left;
  cursor: pointer;
  transition: background 100ms ease;
}

.titlebar-main-menu__item:hover,
.titlebar-main-menu__item.is-open,
.titlebar-main-menu__item:focus-visible {
  background: var(--dw-menu-active);
  color: var(--dw-text);
  outline: none;
  box-shadow: none;
}

.titlebar-main-menu__item--accent .titlebar-main-menu__label {
  color: var(--dw-primary);
  font-weight: 500;
}

.titlebar-main-menu__badge {
  justify-self: end;
  margin-right: 4px;
  padding: 1px 6px;
  border-radius: var(--dw-radius-pill);
  background: var(--dw-primary-soft);
  color: var(--dw-primary);
  font-size: var(--dw-font-size-badge);
  font-weight: 600;
  line-height: 1.3;
}

.titlebar-main-menu__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--dw-text-muted);
}

.titlebar-main-menu__icon svg {
  display: block;
}

.titlebar-main-menu__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.titlebar-main-menu__shortcut {
  justify-self: end;
  margin-right: 4px;
  padding: 0 2px 0 10px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--dw-text-muted);
  font-family: inherit;
  font-size: var(--dw-font-size-menu-caption);
  line-height: 1;
}

.titlebar-main-menu__arrow {
  width: var(--dw-icon-size-xs);
  height: var(--dw-icon-size-xs);
  margin-right: 6px;
  margin-left: auto;
  opacity: 0.55;
}

.titlebar-main-menu__submenu {
  position: relative;
}

.titlebar-main-menu__flyout {
  position: absolute;
  top: 0;
  left: calc(100% - 1px);
  z-index: 2;
  display: flex;
  flex-direction: column;
  width: min(300px, calc(100vw - 24px));
  max-height: min(440px, 58vh);
  overflow-x: hidden;
  overflow-y: auto;
  padding: var(--dw-menu-pad-y) var(--dw-menu-pad-x);
  border: 1px solid var(--dw-menu-border);
  border-radius: var(--dw-menu-radius);
  background: var(--dw-bg-panel);
  box-shadow: var(--dw-menu-shadow);
}

.titlebar-main-menu__item--split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: stretch;
  gap: 0;
  padding: 0;
}

.titlebar-main-menu__item-main {
  display: grid;
  grid-template-columns: var(--dw-menu-gutter) minmax(0, 1fr);
  align-items: center;
  gap: 0;
  min-width: 0;
  min-height: var(--dw-menu-item-h);
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.titlebar-main-menu__item-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  min-height: var(--dw-density-sm);
  margin: 0 4px 0 0;
  padding: 0;
  border: none;
  border-radius: var(--dw-menu-item-radius);
  background: transparent;
  color: var(--dw-text-muted);
  cursor: pointer;
  opacity: 0.4;
  transition: opacity 100ms ease, background 100ms ease, color 100ms ease;
}

.titlebar-main-menu__item--split:hover .titlebar-main-menu__item-action,
.titlebar-main-menu__item-action:focus-visible {
  opacity: 0.9;
}

.titlebar-main-menu__item-action:hover:not(:disabled),
.titlebar-main-menu__item-action:focus-visible:not(:disabled) {
  outline: none;
  box-shadow: none;
  opacity: 1;
  color: var(--dw-danger);
  background: color-mix(in srgb, var(--dw-danger) 14%, transparent);
}

.titlebar-main-menu__item-action:disabled {
  opacity: 0.28;
  cursor: not-allowed;
}

.titlebar-main-menu__empty {
  margin: 0;
  min-height: var(--dw-menu-item-h);
  padding: 0 10px 0 var(--dw-menu-gutter);
  align-items: flex-start;
  justify-content: center;
  text-align: left;
}

.titlebar-main-menu__empty :deep(p) {
  font-size: var(--dw-font-size-menu);
  font-weight: 400;
  color: var(--dw-text-muted);
}
</style>
