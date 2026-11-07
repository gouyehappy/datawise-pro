<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import AiIcon from '@/core/components/AiIcon.vue'

withDefaults(
    defineProps<{
      /** CopilotDock-like inline dots (plain chat wait). Default keeps analysis/card chrome. */
      compact?: boolean
    }>(),
    {compact: false},
)

const {t} = useI18n()
</script>

<template>
  <div
      v-if="compact"
      class="ai-chat-busy"
      role="status"
      :aria-label="t('ai.typing')"
  >
    <span class="ai-chat-busy__dots" aria-hidden="true"><i/><i/><i/></span>
    <span>{{ t('ai.typing') }}</span>
  </div>
  <div v-else class="ai-workflow-card ai-workflow-card--inline ai-chat-loading">
    <div class="ai-chat-loading__orb" aria-hidden="true">
      <span class="ai-chat-loading__ring"/>
      <AiIcon :size="18"/>
    </div>
    <div class="ai-chat-loading__text">
      <span class="ai-chat-loading__label">{{ t('ai.typing') }}</span>
      <span class="ai-chat-loading__hint">{{ t('ai.typingHint') }}</span>
    </div>
    <span class="ai-chat-loading__dots" aria-hidden="true"><i/><i/><i/></span>
  </div>
</template>

<style scoped>
.ai-chat-busy {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-space-3);
  padding: var(--dw-space-1) 0;
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  font-weight: 500;
}

.ai-chat-busy__dots {
  display: inline-flex;
  gap: 4px;
}

.ai-chat-busy__dots i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--dw-text-secondary);
  opacity: 0.45;
  animation: typing-bounce 1.4s infinite ease-in-out;
}

.ai-chat-busy__dots i:nth-child(2) {
  animation-delay: 0.15s;
}

.ai-chat-busy__dots i:nth-child(3) {
  animation-delay: 0.3s;
}

.ai-chat-loading {
  display: flex;
  align-items: center;
  gap: var(--dw-space-7);
  padding: var(--dw-space-8) var(--dw-space-9);
  min-width: min(360px, 100%);
}

.ai-chat-loading__orb {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--dw-density-lg);
  height: var(--dw-density-lg);
  border-radius: var(--dw-panel-radius);
  background: linear-gradient(
      145deg,
      color-mix(in srgb, var(--dw-primary) 16%, var(--dw-bg)),
      var(--dw-bg-panel)
  );
  color: var(--dw-primary);
  flex-shrink: 0;
}

.ai-chat-loading__ring {
  position: absolute;
  inset: -3px;
  border-radius: var(--dw-panel-radius);
  border: 2px solid transparent;
  border-top-color: var(--dw-primary);
  animation: ring-spin 2.4s linear infinite;
}

.ai-chat-loading__text {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-1);
  min-width: 0;
  flex: 1;
}

.ai-chat-loading__label {
  color: var(--dw-text);
  font-size: var(--dw-text-md);
  font-weight: 600;
}

.ai-chat-loading__hint {
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
}

.ai-chat-loading__dots {
  display: inline-flex;
  gap: var(--dw-space-2);
  flex-shrink: 0;
}

.ai-chat-loading__dots i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dw-primary);
  opacity: 0.55;
  animation: typing-bounce 1.8s infinite ease-in-out;
}

.ai-chat-loading__dots i:nth-child(2) {
  animation-delay: 0.2s;
}

.ai-chat-loading__dots i:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typing-bounce {
  0%,
  80%,
  100% {
    transform: translateY(0);
    opacity: 0.45;
  }
  40% {
    transform: translateY(-4px);
    opacity: 1;
  }
}

@keyframes ring-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
