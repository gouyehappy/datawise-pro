<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {IconButton} from '@/core/components'
import {useEphemeralNotice} from '@/features/ai/shared/composables/useEphemeralNotice'

const props = defineProps<{
  visible: boolean
}>()

const {t} = useI18n()
const active = computed(() => props.visible)
const {visible: shown, dismiss} = useEphemeralNotice(active, {
  ttlMs: 7000,
  sessionKey: 'dw-ai-python-simulated-notice',
})
</script>

<template>
  <Transition name="ai-notice">
    <div v-if="shown" class="python-sim-banner" role="status">
      <span class="python-sim-banner__icon" aria-hidden="true">!</span>
      <div class="python-sim-banner__body">
        <strong>{{ t('ai.pythonSimulated.bannerTitle') }}</strong>
        <p>{{ t('ai.pythonSimulated.bannerHint') }}</p>
      </div>
      <IconButton
          class="python-sim-banner__close"
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
.python-sim-banner {
  display: flex;
  gap: var(--dw-gap-md);
  align-items: flex-start;
  margin: var(--dw-space-6) var(--dw-space-10) 0;
  padding: var(--dw-pad-control-lg);
  border-radius: var(--dw-control-radius);
  border: 1px solid color-mix(in srgb, var(--dw-warning) 40%, var(--dw-border-light));
  background: color-mix(in srgb, var(--dw-warning) 10%, var(--dw-bg-panel));
}

.python-sim-banner__icon {
  flex-shrink: 0;
  width: var(--dw-control-h-xs);
  height: var(--dw-control-h-xs);
  border-radius: var(--dw-radius-pill);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--dw-bg);
  color: var(--dw-warning);
  font-size: var(--dw-text-sm);
  font-weight: 700;
}

.python-sim-banner__body {
  flex: 1;
  min-width: 0;
}

.python-sim-banner__body strong {
  display: block;
  font-size: var(--dw-text-sm);
  color: var(--dw-text);
}

.python-sim-banner__body p {
  margin: var(--dw-space-1) 0 0;
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
  color: var(--dw-text-secondary);
}

.python-sim-banner__close {
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
