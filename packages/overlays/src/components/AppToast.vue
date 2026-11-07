<script setup lang="ts">
import {computed} from 'vue'
import {DwIcon, type DwIconName} from '@datawise/icons'
import {IconButton, useDwI18n} from '@datawise/ui'
import {useDwToast} from '../toast/useDwToast'
import type {ToastVariant as TV} from '../toast/createToastController'

const t = useDwI18n()
const toast = useDwToast()

const TOAST_ICON: Record<TV, DwIconName> = {
  info: 'info',
  success: 'check',
  warning: 'alert-triangle',
  error: 'alert-circle',
}

/** Host vue-i18n uses `toast.kinds.*`; package defaults mirror both flat + nested. */
const TOAST_TITLE_KEY: Record<TV, string> = {
  info: 'toast.kinds.info',
  success: 'toast.kinds.success',
  warning: 'toast.kinds.warning',
  error: 'toast.kinds.error',
}

const iconName = computed(() => TOAST_ICON[toast.variant.value])
const title = computed(() => t(TOAST_TITLE_KEY[toast.variant.value]))
</script>

<template>
  <Transition name="app-toast">
    <div
      v-if="toast.message.value"
      class="app-toast"
      :class="`app-toast--${toast.variant.value}`"
      :role="toast.variant.value === 'error' || toast.variant.value === 'warning' ? 'alert' : 'status'"
      :aria-live="toast.variant.value === 'error' ? 'assertive' : 'polite'"
    >
      <span class="app-toast__badge" aria-hidden="true">
        <DwIcon class="app-toast__icon" :name="iconName" size="md" :stroke-width="2"/>
      </span>
      <div class="app-toast__body">
        <div class="app-toast__title">{{ title }}</div>
        <div class="app-toast__text">{{ toast.message.value }}</div>
        <button
          v-if="toast.action.value"
          type="button"
          class="app-toast__action"
          @click="toast.runAction()"
        >
          {{ toast.action.value.label }}
        </button>
      </div>
      <IconButton
        class="app-toast__close"
        size="sm"
        :title="t('common.close')"
        @click="toast.dismiss()"
      >
        <DwIcon name="x" size="sm"/>
      </IconButton>
    </div>
  </Transition>
</template>

<style scoped>
.app-toast {
  --toast-accent: var(--dw-info);
  --toast-badge-bg: var(--dw-info-soft);
  --toast-badge-fg: var(--dw-info);

  position: fixed;
  right: var(--dw-space-8);
  bottom: var(--dw-space-8);
  z-index: var(--dw-z-toast, 1200);
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--dw-space-5);
  align-items: start;
  width: min(92vw, 420px);
  padding: var(--dw-space-6) var(--dw-space-7);
  padding-left: calc(var(--dw-space-7) + 4px);
  border: 1px solid var(--dw-panel-border);
  border-radius: var(--dw-modal-radius, var(--dw-panel-radius));
  background: var(--dw-bg-panel);
  box-shadow: var(--dw-shadow);
  overflow: hidden;
  pointer-events: auto;
}

.app-toast::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--toast-accent);
}

.app-toast--success { --toast-accent: var(--dw-success); --toast-badge-bg: var(--dw-success-soft); --toast-badge-fg: var(--dw-success); }
.app-toast--warning { --toast-accent: var(--dw-warning); --toast-badge-bg: var(--dw-warning-soft); --toast-badge-fg: var(--dw-warning); }
.app-toast--error { --toast-accent: var(--dw-danger); --toast-badge-bg: var(--dw-danger-soft); --toast-badge-fg: var(--dw-danger); }

.app-toast__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: var(--dw-density-md);
  height: var(--dw-density-md);
  border-radius: var(--dw-control-radius);
  background: var(--toast-badge-bg);
  color: var(--toast-badge-fg);
}

.app-toast__body { min-width: 0; }
.app-toast__title {
  font-size: var(--dw-text-sm);
  font-weight: 600;
  color: var(--dw-text);
}
.app-toast__text {
  margin-top: var(--dw-space-1);
  font-size: var(--dw-text-sm);
  color: var(--dw-text-secondary);
  line-height: var(--dw-leading-relaxed);
  word-break: break-word;
}
.app-toast__action {
  margin-top: var(--dw-space-3);
  padding: 0;
  color: var(--dw-primary);
  font-size: var(--dw-text-sm);
  font-weight: 600;
}

.app-toast-enter-active,
.app-toast-leave-active {
  transition: opacity var(--dw-duration) var(--dw-ease), transform var(--dw-duration) var(--dw-ease);
}
.app-toast-enter-from,
.app-toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
