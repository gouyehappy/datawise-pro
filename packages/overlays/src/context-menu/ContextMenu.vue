<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from 'reka-ui'
import ContextMenuIcon from './ContextMenuIcon.vue'
import {DwIcon} from '@datawise/icons'
import {resolveContextMenuSubmenuPanel} from './submenu-panels'
import type {ContextMenuItem} from './types'

const props = defineProps<{
  items: ContextMenuItem[]
  x: number
  y: number
}>()

const emit = defineEmits<{
  select: [id: string]
  close: []
}>()

/** Mounted by Host via v-if — start open; dismiss flows through update:open. */
const open = ref(true)

/**
 * Prefer upward open near bottom; floating-ui still flips/shifts.
 */
const preferredSide = computed<'top' | 'bottom'>(() => {
  const pad = 12
  const below = Math.max(0, window.innerHeight - props.y - pad)
  const above = Math.max(0, props.y - pad)
  return below < 320 && above > below ? 'top' : 'bottom'
})

/**
 * Defer outside-close so the opening click/right-click cannot instantly dismiss
 * the menu (especially under JCEF).
 */
const outsideCloseArmed = ref(false)
let armTimer: number | undefined

onMounted(() => {
  armTimer = window.setTimeout(() => {
    outsideCloseArmed.value = true
  }, 0)
})

onUnmounted(() => {
  if (armTimer != null) window.clearTimeout(armTimer)
})

function hasSubmenu(item: ContextMenuItem) {
  return !!item.children?.length || !!item.submenuPanel
}

function isDivider(item: ContextMenuItem) {
  return !!(item.divider || item.separator)
}

function itemClass(item: ContextMenuItem, extra?: Record<string, boolean>) {
  return {
    'is-disabled': item.disabled,
    'is-accent': item.accent,
    'is-selected': item.selected,
    'is-danger': item.danger,
    ...extra,
  }
}

function onOpenChange(next: boolean) {
  open.value = next
  if (!next) emit('close')
}

function onSelect(id: string) {
  emit('select', id)
  open.value = false
}

function onCloseAutoFocus(event: Event) {
  event.preventDefault()
}

function onInteractOutside(event: Event) {
  if (!outsideCloseArmed.value) {
    event.preventDefault()
  }
}
</script>

<template>
  <DropdownMenuRoot :open="open" modal @update:open="onOpenChange">
    <DropdownMenuTrigger as-child>
      <span
          class="dw-ctx-menu-anchor"
          aria-hidden="true"
          :style="{
            position: 'fixed',
            left: `${props.x}px`,
            top: `${props.y}px`,
            width: 0,
            height: 0,
            pointerEvents: 'none',
          }"
      />
    </DropdownMenuTrigger>

    <DropdownMenuPortal>
      <DropdownMenuContent
          class="dw-ctx-menu"
          :side="preferredSide"
          align="start"
          :side-offset="0"
          :avoid-collisions="true"
          :side-flip="true"
          :align-flip="true"
          sticky="always"
          update-position-strategy="always"
          :collision-padding="12"
          @close-auto-focus="onCloseAutoFocus"
          @pointer-down-outside="onInteractOutside"
          @interact-outside="onInteractOutside"
      >
        <div class="dw-ctx-menu__body">
          <template v-for="item in items" :key="item.id">
            <DropdownMenuSeparator
                v-if="isDivider(item)"
                class="dw-ctx-menu__divider"
            />

            <DropdownMenuLabel v-else-if="item.header" as-child>
              <div class="dw-ctx-menu__section-head">{{ item.label }}</div>
            </DropdownMenuLabel>

            <DropdownMenuSub v-else-if="hasSubmenu(item)">
              <DropdownMenuSubTrigger
                  class="dw-ctx-menu__item has-submenu"
                  :class="itemClass(item)"
                  :disabled="item.disabled"
                  :title="item.disabled && item.disabledHint ? item.disabledHint : undefined"
              >
                <ContextMenuIcon v-if="item.icon" :name="item.icon" :danger="item.danger" :selected="item.selected"/>
                <span v-else class="dw-ctx-menu__icon-spacer" aria-hidden="true"/>
                <span class="dw-ctx-menu__label">{{ item.label }}</span>
                <kbd v-if="item.shortcut" class="dw-ctx-menu__shortcut">{{ item.shortcut }}</kbd>
                <DwIcon
                    v-else
                    class="dw-ctx-menu__arrow"
                    name="chevron-right"
                    size="xs"
                    :stroke-width="1.5"
                />
              </DropdownMenuSubTrigger>

              <DropdownMenuPortal>
                <DropdownMenuSubContent
                    class="dw-ctx-menu__submenu"
                    :class="{ 'dw-ctx-menu__submenu--panel': !!item.submenuPanel }"
                    :side-offset="6"
                    :avoid-collisions="true"
                    :side-flip="true"
                    :align-flip="true"
                    sticky="always"
                    update-position-strategy="always"
                    :collision-padding="12"
                    @pointer-down-outside="onInteractOutside"
                    @interact-outside="onInteractOutside"
                >
                  <div
                      class="dw-ctx-menu__body"
                      :class="{
                        'dw-ctx-menu__body--submenu': !item.submenuPanel,
                        'dw-ctx-menu__body--panel': !!item.submenuPanel,
                      }"
                  >
                    <template v-if="item.children?.length">
                      <DropdownMenuItem
                          v-for="child in item.children"
                          :key="child.id"
                          class="dw-ctx-menu__item"
                          :class="itemClass(child)"
                          :disabled="child.disabled"
                          :title="child.disabled && child.disabledHint ? child.disabledHint : undefined"
                          @select="onSelect(child.id)"
                      >
                        <ContextMenuIcon v-if="child.icon" :name="child.icon" :selected="child.selected"/>
                        <span v-else class="dw-ctx-menu__icon-spacer" aria-hidden="true"/>
                        <span class="dw-ctx-menu__label">{{ child.label }}</span>
                        <DwIcon
                            v-if="child.selected"
                            name="check"
                            size="sm"
                            :stroke-width="2"
                            class="dw-ctx-menu__check"
                        />
                        <kbd v-else-if="child.shortcut" class="dw-ctx-menu__shortcut">{{ child.shortcut }}</kbd>
                      </DropdownMenuItem>
                    </template>

                    <component
                        :is="resolveContextMenuSubmenuPanel(item.submenuPanel)"
                        v-else-if="item.submenuPanel"
                        @select="onSelect"
                    />
                  </div>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>

            <DropdownMenuItem
                v-else
                class="dw-ctx-menu__item"
                :class="itemClass(item)"
                :disabled="item.disabled"
                :title="item.disabled && item.disabledHint ? item.disabledHint : undefined"
                @select="onSelect(item.id)"
            >
              <ContextMenuIcon v-if="item.icon" :name="item.icon" :danger="item.danger" :selected="item.selected"/>
              <span v-else class="dw-ctx-menu__icon-spacer" aria-hidden="true"/>
              <span class="dw-ctx-menu__label">{{ item.label }}</span>
              <DwIcon
                  v-if="item.selected"
                  name="check"
                  size="sm"
                  :stroke-width="2"
                  class="dw-ctx-menu__check"
              />
              <kbd v-else-if="item.shortcut" class="dw-ctx-menu__shortcut">{{ item.shortcut }}</kbd>
            </DropdownMenuItem>
          </template>
        </div>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
