<script setup lang="ts">
import {nextTick, onMounted, onUnmounted, ref} from 'vue'
import {IconButton} from '@datawise/ui'
import {DwIcon} from '@datawise/icons'
import {usePopoverEscape} from '../composables/usePopoverEscape'

/** Icon names are free strings so hosts can pass product icon keys. */
export interface ModuleHeroMenuItem {
  id: string
  label: string
  icon?: string
  disabled?: boolean
  dividerBefore?: boolean
}

const props = withDefaults(defineProps<{
  ariaLabel: string
  items: ModuleHeroMenuItem[]
  active?: boolean
  icon?: string
  /** Prefer opening above the trigger (useful near the bottom of the viewport). */
  placement?: 'down' | 'up' | 'auto'
}>(), {
  active: false,
  icon: 'settings',
  placement: 'auto',
})

const emit = defineEmits<{
  select: [id: string]
}>()

const open = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const menuStyle = ref<{top: string; left: string} | undefined>()

usePopoverEscape(
  () => open.value,
  () => close(),
  {
    containRefs: () => [triggerRef.value, menuRef.value],
  },
)

function close() {
  open.value = false
  menuStyle.value = undefined
}

function placeMenu() {
  const trigger = triggerRef.value
  const menu = menuRef.value
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  const menuWidth = Math.max(220, menu?.offsetWidth ?? 220)
  const measured = menu?.offsetHeight ?? 0
  const menuHeight = measured > 0 ? measured : Math.max(48, props.items.length * 40 + 16)
  const gap = 6
  const left = Math.min(
    Math.max(8, rect.right - menuWidth),
    window.innerWidth - menuWidth - 8,
  )
  const spaceBelow = window.innerHeight - rect.bottom - 8
  const spaceAbove = rect.top - 8
  const preferUp =
    props.placement === 'up'
    || (props.placement === 'auto' && spaceBelow < menuHeight + gap && spaceAbove > spaceBelow)
  const top = preferUp
    ? Math.max(8, rect.top - menuHeight - gap)
    : Math.min(window.innerHeight - menuHeight - 8, rect.bottom + gap)
  menuStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
  }
}

async function toggle(event?: MouseEvent) {
  event?.stopPropagation()
  if (open.value) {
    close()
    return
  }
  open.value = true
  await nextTick()
  placeMenu()
  requestAnimationFrame(() => placeMenu())
}

function run(id: string, disabled?: boolean) {
  if (disabled) return
  close()
  emit('select', id)
}

function onWindowChange() {
  if (!open.value) return
  placeMenu()
}

onMounted(() => {
  window.addEventListener('resize', onWindowChange)
  window.addEventListener('scroll', onWindowChange, true)
})

onUnmounted(() => {
  window.removeEventListener('resize', onWindowChange)
  window.removeEventListener('scroll', onWindowChange, true)
})
</script>

<template>
  <div ref="triggerRef" class="mp-hero-settings">
    <IconButton
      :title="ariaLabel"
      :active="open || active"
      @click="toggle($event)"
    >
      <DwIcon :name="icon" :stroke-width="1.6"/>
    </IconButton>

    <Teleport to="body">
      <div
        v-if="open"
        ref="menuRef"
        class="mp-hero-settings__menu"
        :style="menuStyle"
        role="menu"
        :aria-label="ariaLabel"
      >
        <template v-for="item in items" :key="item.id">
          <div v-if="item.dividerBefore" class="mp-hero-settings__divider" role="separator"/>
          <button
            type="button"
            class="mp-hero-settings__item"
            role="menuitem"
            :disabled="item.disabled"
            @click="run(item.id, item.disabled)"
          >
            <DwIcon v-if="item.icon" :name="item.icon" :stroke-width="1.6"/>
            <span>{{ item.label }}</span>
          </button>
        </template>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.mp-hero-settings {
  position: relative;
  display: inline-flex;
}
</style>

<style>
/* Teleported to body — unscoped */
.mp-hero-settings__menu {
  position: fixed;
  z-index: var(--dw-z-popover);
  min-width: 220px;
  padding: var(--dw-space-1);
  border: 1px solid var(--dw-panel-border);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg-editor);
  box-shadow: var(--dw-panel-shadow);
}

.mp-hero-settings__item {
  display: flex;
  align-items: center;
  gap: var(--dw-space-2);
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: calc(var(--dw-control-radius) - 2px);
  background: transparent;
  color: var(--dw-text-primary);
  font: inherit;
  font-size: var(--dw-text-sm);
  text-align: left;
  cursor: pointer;
}

.mp-hero-settings__item:hover:not(:disabled) {
  background: color-mix(in srgb, var(--dw-primary) 10%, transparent);
}

.mp-hero-settings__item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.mp-hero-settings__item svg {
  flex-shrink: 0;
  width: var(--dw-icon-size-sm);
  height: var(--dw-icon-size-sm);
  color: var(--dw-text-secondary);
}

.mp-hero-settings__divider {
  height: 1px;
  margin: var(--dw-space-1) 6px;
  background: var(--dw-panel-border);
}
</style>
