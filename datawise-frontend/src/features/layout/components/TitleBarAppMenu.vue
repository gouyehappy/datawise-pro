<script setup lang="ts">
import {nextTick, onMounted, onUnmounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {storeToRefs} from 'pinia'
import {usePopoverEscape} from '@/core/composables/usePopoverEscape'
import {DwIcon} from '@/core/icons'
import TitleBarMainMenu from '@/features/layout/components/TitleBarMainMenu.vue'
import {useLayoutStore} from '@/features/layout/stores/layout'

const {t} = useI18n()
const layout = useLayoutStore()
const {showProfileMenu} = storeToRefs(layout)

const rootRef = ref<HTMLElement | null>(null)
const btnRef = ref<HTMLElement | null>(null)
const menuPanelRef = ref<InstanceType<typeof TitleBarMainMenu> | null>(null)
const menuStyle = ref<{top: string; left: string} | undefined>()

usePopoverEscape(showProfileMenu, () => layout.closeProfileMenu(), {
  // TitleBarMainMenu 已 Teleport，并自带 document click；此处仅保留 Esc
  closeOnOutside: false,
})

function updatePlacement() {
    const btn = btnRef.value
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    menuStyle.value = {
        top: `${rect.bottom + 6}px`,
        left: `${rect.left}px`,
    }
}

function toggle(event: MouseEvent) {
    event.stopPropagation()
    layout.toggleProfileMenu()
    if (layout.showProfileMenu) {
        void nextTick(updatePlacement)
    }
}

watch(showProfileMenu, (open) => {
    if (open) void nextTick(updatePlacement)
})

function onResize() {
    if (showProfileMenu.value) updatePlacement()
}

onMounted(() => {
    document.addEventListener('click', onDocumentClick)
    window.addEventListener('resize', onResize)
})

onUnmounted(() => {
    document.removeEventListener('click', onDocumentClick)
    window.removeEventListener('resize', onResize)
})

function onDocumentClick(event: MouseEvent) {
    if (!showProfileMenu.value) return
    const target = event.target
    if (!(target instanceof Node)) return
    if (rootRef.value?.contains(target)) return
    if (menuPanelRef.value?.containsNode(target)) return
    layout.closeProfileMenu()
}
</script>

<template>
  <div ref="rootRef" class="titlebar-app-menu">
    <button
        ref="btnRef"
        type="button"
        class="titlebar-app-menu__btn"
        :class="{ 'is-active': showProfileMenu }"
        data-onboarding="titlebar-app-menu"
        :aria-label="t('app.titleBar.appMenu.label')"
        :aria-expanded="showProfileMenu"
        @click="toggle"
    >
      <DwIcon class="titlebar-app-menu__icon" name="layout" size="menu" :stroke-width="1.35"/>
    </button>

    <Teleport to="body">
      <TitleBarMainMenu
          v-if="showProfileMenu"
          ref="menuPanelRef"
          :menu-style="menuStyle"
          @close="layout.closeProfileMenu()"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.titlebar-app-menu {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: 100%;
  margin-left: 0;
  padding: 0;
  -webkit-app-region: no-drag;
}

.titlebar-app-menu__btn {
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

.titlebar-app-menu__btn:hover {
  background: var(--dw-titlebar-chip-hover);
  color: var(--dw-text);
}

.titlebar-app-menu__btn.is-active {
  background: var(--dw-titlebar-chip-active);
  color: var(--dw-text);
}

.titlebar-app-menu__icon {
  width: 16px;
  height: 16px;
}
</style>
