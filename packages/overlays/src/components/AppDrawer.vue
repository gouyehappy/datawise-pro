<script setup lang="ts">
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'

const props = withDefaults(
  defineProps<{
    open: boolean
    ariaLabel: string
    width?: string
    closeOnEscape?: boolean
  }>(),
  {
    width: 'min(520px, 100vw)',
    closeOnEscape: true,
  },
)

const emit = defineEmits<{
  close: []
}>()

function onOpenChange(next: boolean) {
  if (!next) emit('close')
}

function onEscapeKeyDown(event: KeyboardEvent) {
  if (!props.closeOnEscape) event.preventDefault()
}

/** Drawer keeps historical behavior: backdrop is non-interactive / no click-dismiss. */
function onPointerDownOutside(event: Event) {
  event.preventDefault()
}

function onInteractOutside(event: Event) {
  event.preventDefault()
}
</script>

<template>
  <DialogRoot :open="open" modal @update:open="onOpenChange">
    <DialogPortal>
      <DialogOverlay class="app-drawer-overlay-layer"/>
      <DialogContent
          class="app-drawer-panel"
          :style="{ width }"
          @escape-key-down="onEscapeKeyDown"
          @pointer-down-outside="onPointerDownOutside"
          @interact-outside="onInteractOutside"
      >
        <DialogTitle class="app-modal-sr-only">
          {{ ariaLabel }}
        </DialogTitle>
        <DialogDescription class="app-modal-sr-only">
          {{ ariaLabel }}
        </DialogDescription>
        <slot/>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
