<script setup lang="ts">
import {ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useLayoutStore} from '@/features/layout/stores/layout'

const props = defineProps<{
  connectionId: string
  connectionName?: string
}>()

const {t} = useI18n()
const explorer = useExplorerStore()
const layout = useLayoutStore()
const reconnecting = ref(false)

async function onReconnect() {
  if (reconnecting.value) return
  reconnecting.value = true
  try {
    const ok = await explorer.connectConnection(props.connectionId, {notify: true})
    if (ok) {
      layout.showSuccessToast(
          t('explorer.connectionReconnected', {
            name: props.connectionName || props.connectionId,
          }),
      )
    }
  } finally {
    reconnecting.value = false
  }
}
</script>

<template>
  <div class="connection-reconnect-overlay" role="dialog" aria-modal="true">
    <div class="connection-reconnect-overlay__content">
      <div class="connection-reconnect-overlay__mark" aria-hidden="true">
        <DwIcon name="disconnect" size="lg" :stroke-width="1.5"/>
      </div>
      <div class="connection-reconnect-overlay__copy">
        <p class="connection-reconnect-overlay__title">
          {{ t('explorer.connectionNeedsReconnectTitle') }}
        </p>
        <p class="connection-reconnect-overlay__hint">
          {{ t('explorer.connectionNeedsReconnectHint', {
            name: connectionName || connectionId,
          }) }}
        </p>
      </div>
      <button
          type="button"
          class="connection-reconnect-overlay__cta"
          :disabled="reconnecting"
          @click="onReconnect"
      >
        <span
            class="connection-reconnect-overlay__cta-glyph"
            :class="{ 'is-spinning': reconnecting }"
            aria-hidden="true"
        >
          <DwIcon name="refresh" size="sm" :stroke-width="2"/>
        </span>
        <span class="connection-reconnect-overlay__cta-label">
          {{ reconnecting
            ? t('explorer.connectionNeedsReconnectLoading')
            : t('explorer.connectionNeedsReconnectAction') }}
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.connection-reconnect-overlay {
  position: absolute;
  inset: 0;
  z-index: var(--dw-z-toolbar);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--dw-space-12);
  box-sizing: border-box;
  /* 轻雾遮罩：透出工作区，内容与蒙层同材质 */
  background: color-mix(in srgb, var(--dw-bg-muted) 42%, transparent);
  backdrop-filter: blur(5px) saturate(0.95);
  pointer-events: auto;
}

.connection-reconnect-overlay__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--dw-space-7);
  max-width: 26rem;
  width: min(100%, 26rem);
  text-align: center;
}

.connection-reconnect-overlay__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(var(--dw-icon-size-xl) * 2.4);
  height: calc(var(--dw-icon-size-xl) * 2.4);
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--dw-border-light) 70%, transparent);
  background: color-mix(in srgb, var(--dw-bg) 36%, transparent);
  color: color-mix(in srgb, var(--dw-text-secondary) 70%, var(--dw-primary));
  backdrop-filter: blur(8px);
}

.connection-reconnect-overlay__copy {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-3);
}

.connection-reconnect-overlay__title {
  margin: 0;
  font-size: calc(var(--dw-text-lg) + var(--dw-space-1));
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--dw-text);
}

.connection-reconnect-overlay__hint {
  margin: 0 auto;
  max-width: 32em;
  font-size: var(--dw-text-sm);
  line-height: var(--dw-leading-loose);
  color: var(--dw-text-secondary);
}

/* 同材质雾面胶囊：嵌在遮罩里，而不是一块实色浮层 */
.connection-reconnect-overlay__cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--dw-space-3);
  min-width: 12.5rem;
  height: calc(var(--dw-btn-height) + var(--dw-space-4));
  margin-top: var(--dw-space-3);
  padding: 0 var(--dw-space-5) 0 var(--dw-space-4);
  border: 1px solid color-mix(in srgb, var(--dw-border-light) 80%, transparent);
  border-radius: var(--dw-radius-pill);
  background: color-mix(in srgb, var(--dw-bg) 34%, transparent);
  color: color-mix(in srgb, var(--dw-text) 78%, var(--dw-primary));
  font-size: var(--dw-text-sm);
  font-weight: 600;
  letter-spacing: 0.04em;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  backdrop-filter: blur(10px) saturate(1.02);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--dw-on-accent) 42%, transparent);
  transition:
      transform var(--dw-duration) var(--dw-ease),
      background var(--dw-duration-fast) var(--dw-ease),
      border-color var(--dw-duration-fast) var(--dw-ease),
      color var(--dw-duration-fast) var(--dw-ease),
      box-shadow var(--dw-duration-fast) var(--dw-ease),
      opacity var(--dw-duration-fast) var(--dw-ease);
}

.connection-reconnect-overlay__cta-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(var(--dw-icon-size-lg) + var(--dw-space-2));
  height: calc(var(--dw-icon-size-lg) + var(--dw-space-2));
  border-radius: 50%;
  background: color-mix(in srgb, var(--dw-primary) 10%, transparent);
  color: var(--dw-primary);
}

.connection-reconnect-overlay__cta-label {
  padding-right: var(--dw-space-3);
}

.connection-reconnect-overlay__cta:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--dw-primary) 28%, var(--dw-border-light));
  background: color-mix(in srgb, var(--dw-primary) 8%, color-mix(in srgb, var(--dw-bg) 42%, transparent));
  color: var(--dw-primary);
  box-shadow:
      inset 0 1px 0 color-mix(in srgb, var(--dw-on-accent) 48%, transparent),
      0 var(--dw-space-2) var(--dw-space-6) color-mix(in srgb, var(--dw-primary) 8%, transparent);
}

.connection-reconnect-overlay__cta:hover:not(:disabled) .connection-reconnect-overlay__cta-glyph {
  background: color-mix(in srgb, var(--dw-primary) 16%, transparent);
}

.connection-reconnect-overlay__cta:active:not(:disabled) {
  transform: translateY(1px);
  background: color-mix(in srgb, var(--dw-primary) 12%, color-mix(in srgb, var(--dw-bg) 40%, transparent));
}

.connection-reconnect-overlay__cta:focus-visible {
  outline: none;
  box-shadow: var(--dw-focus-ring);
}

.connection-reconnect-overlay__cta:disabled {
  opacity: 0.7;
  cursor: default;
}

.connection-reconnect-overlay__cta-glyph.is-spinning {
  animation: connection-reconnect-spin 0.75s linear infinite;
}

@keyframes connection-reconnect-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
