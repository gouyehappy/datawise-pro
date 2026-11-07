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
import {IconButton, useDwI18n} from '@datawise/ui'
import {DwIcon} from '@datawise/icons'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    subtitle?: string
    width?: string
    maxHeight?: string
    closeOnBackdrop?: boolean
    closeOnEscape?: boolean
    showClose?: boolean
    autoFocus?: 'body' | 'close'
    closeLabel?: string
  }>(),
  {
    width: '440px',
    closeOnBackdrop: false,
    closeOnEscape: true,
    showClose: true,
    autoFocus: 'body',
  },
)

const emit = defineEmits<{
  close: []
}>()

const t = useDwI18n()

const BODY_FOCUS_SELECTOR = [
  '.app-modal-body input:not([disabled]):not([type="hidden"])',
  '.app-modal-body textarea:not([disabled])',
  '.app-modal-body select:not([disabled])',
  '.app-modal-body button:not([disabled])',
  '.app-modal-body [href]',
  '.app-modal-body [tabindex]:not([tabindex="-1"])',
].join(', ')

function requestClose() {
  emit('close')
}

function onOpenChange(next: boolean) {
  if (!next) emit('close')
}

function onEscapeKeyDown(event: KeyboardEvent) {
  if (!props.closeOnEscape) event.preventDefault()
}

function onPointerDownOutside(event: Event) {
  if (!props.closeOnBackdrop) event.preventDefault()
}

function onInteractOutside(event: Event) {
  if (!props.closeOnBackdrop) event.preventDefault()
}

function onCloseAutoFocus(event: Event) {
  event.preventDefault()
}

function onOpenAutoFocus(event: Event) {
  event.preventDefault()
  const root = (event.currentTarget instanceof HTMLElement
    ? event.currentTarget
    : event.target instanceof HTMLElement
      ? event.target.closest('.app-modal')
      : null)
  if (!root) return
  void nextTick(async () => {
    await nextTick()
    const active = document.activeElement
    if (active instanceof HTMLElement && root.contains(active) && active !== root) return

    if (props.autoFocus === 'close') {
      ;(root.querySelector('.app-modal-close') as HTMLElement | null)?.focus()
      return
    }

    const preferred =
      (root.querySelector(BODY_FOCUS_SELECTOR) as HTMLElement | null)
      ?? (root.querySelector('.app-modal-footer button:not([disabled])') as HTMLElement | null)
    if (preferred) {
      preferred.focus()
      return
    }
    ;(root.querySelector('.app-modal-close') as HTMLElement | null)?.focus()
  })
}
</script>

<template>
  <DialogRoot :open="open" modal @update:open="onOpenChange">
    <DialogPortal>
      <DialogOverlay class="app-modal-overlay"/>
      <DialogContent
        class="app-modal"
        :class="{ 'app-modal--constrained': !!maxHeight }"
        :style="{
          maxWidth: width,
          maxHeight: maxHeight,
          height: maxHeight || undefined,
        }"
        @open-auto-focus="onOpenAutoFocus"
        @close-auto-focus="onCloseAutoFocus"
        @escape-key-down="onEscapeKeyDown"
        @pointer-down-outside="onPointerDownOutside"
        @interact-outside="onInteractOutside"
      >
        <header class="app-modal-header">
          <div class="app-modal-heading">
            <DialogTitle as-child>
              <h2>{{ title }}</h2>
            </DialogTitle>
            <DialogDescription v-if="subtitle" as-child>
              <p>{{ subtitle }}</p>
            </DialogDescription>
            <DialogDescription v-else class="app-modal-sr-only">
              {{ title }}
            </DialogDescription>
          </div>
          <div v-if="$slots['header-actions']" class="app-modal-header-actions">
            <slot name="header-actions"/>
          </div>
          <IconButton
            v-if="showClose"
            class="app-modal-close"
            size="sm"
            :title="closeLabel ?? t('common.close')"
            @click="requestClose"
          >
            <DwIcon name="x" size="sm"/>
          </IconButton>
        </header>

        <div class="app-modal-body">
          <slot/>
        </div>

        <footer v-if="$slots.footer" class="app-modal-footer">
          <slot name="footer"/>
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
