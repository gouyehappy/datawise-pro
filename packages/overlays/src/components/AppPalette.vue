<script setup lang="ts">
import {nextTick} from 'vue'
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
    maxHeight?: string
    closeOnEscape?: boolean
  }>(),
  {
    width: 'min(640px, calc(100vw - 32px))',
    maxHeight: 'min(60vh, 560px)',
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

function onOpenAutoFocus(event: Event) {
  event.preventDefault()
  const root = (event.currentTarget instanceof HTMLElement
      ? event.currentTarget
      : event.target instanceof HTMLElement
        ? event.target.closest('.app-palette')
        : null)
  void nextTick(() => {
    const input =
        (root?.querySelector('.app-palette__input') as HTMLInputElement | null)
        ?? (root?.querySelector('input') as HTMLInputElement | null)
    input?.focus()
    input?.select()
  })
}
</script>

<template>
  <DialogRoot :open="open" modal @update:open="onOpenChange">
    <DialogPortal>
      <DialogOverlay class="app-palette-overlay"/>
      <DialogContent
          class="app-palette"
          :style="{ width, maxHeight }"
          @open-auto-focus="onOpenAutoFocus"
          @escape-key-down="onEscapeKeyDown"
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
