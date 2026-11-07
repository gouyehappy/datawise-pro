<script setup lang="ts">
import {computed, toRef} from 'vue'
import {useI18n} from 'vue-i18n'
import {IconButton} from '@/core/components'
import {useEphemeralNotice} from '@/features/ai/shared/composables/useEphemeralNotice'

const props = defineProps<{
  targetCount: number
}>()

const {t} = useI18n()
const active = computed(() => props.targetCount > 1)
const resetKey = toRef(props, 'targetCount')
const {visible: shown, dismiss} = useEphemeralNotice(active, {
  ttlMs: 5500,
  resetKey,
})
</script>

<template>
  <Transition name="ai-notice">
    <div v-if="shown" class="federated-banner" role="status">
      <span class="federated-banner__icon" aria-hidden="true">⇄</span>
      <div class="federated-banner__body">
        <strong>{{ t('ai.federated.bannerTitle') }}</strong>
        <p>{{ t('ai.federated.bannerHint', {count: targetCount}) }}</p>
      </div>
      <IconButton
          class="federated-banner__close"
          size="sm"
          :title="t('common.close')"
          @click="dismiss"
      >
        ×
      </IconButton>
    </div>
  </Transition>
</template>

<style scoped>
.federated-banner {
  display: flex;
  gap: var(--dw-gap-md);
  align-items: flex-start;
  margin: var(--dw-space-6) var(--dw-space-10) 0;
  padding: var(--dw-pad-control-lg);
  border-radius: var(--dw-control-radius);
  background: color-mix(in srgb, var(--dw-primary-soft) 55%, var(--dw-bg-panel));
  border: 1px solid color-mix(in srgb, var(--dw-primary) 24%, var(--dw-border-light));
}

.federated-banner__icon {
  flex-shrink: 0;
  width: var(--dw-control-h-xs);
  height: var(--dw-control-h-xs);
  border-radius: var(--dw-radius-pill);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--dw-bg);
  color: var(--dw-primary);
  font-size: var(--dw-text-sm);
  font-weight: 700;
}

.federated-banner__body {
  flex: 1;
  min-width: 0;
}

.federated-banner__body strong {
  display: block;
  font-size: var(--dw-text-sm);
  color: var(--dw-text);
}

.federated-banner__body p {
  margin: var(--dw-space-1) 0 0;
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
  color: var(--dw-text-secondary);
}

.federated-banner__close {
  flex-shrink: 0;
  margin: calc(var(--dw-space-1) * -1) calc(var(--dw-space-1) * -1) 0 0;
}

.ai-notice-enter-active,
.ai-notice-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.ai-notice-enter-from,
.ai-notice-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
