<script setup lang="ts">
import AiIcon from '@/core/components/AiIcon.vue'
</script>

<template>
  <div class="msg-row assistant">
    <div class="avatar avatar-ai" aria-hidden="true">
      <AiIcon :size="16"/>
    </div>
    <div class="msg-body msg-body--workflow">
      <slot/>
    </div>
  </div>
</template>

<style scoped>
.msg-row {
  display: flex;
  gap: var(--dw-space-6);
  align-items: flex-start;
}

.avatar {
  flex-shrink: 0;
  width: 32px;
  height: var(--dw-tab-height);
  border-radius: var(--dw-control-radius);
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-ai {
  background: linear-gradient(
      145deg,
      color-mix(in srgb, var(--dw-primary) 20%, var(--dw-bg-panel)),
      var(--dw-bg-panel)
  );
  border: 1px solid color-mix(in srgb, var(--dw-primary) 28%, var(--dw-border));
  color: var(--dw-primary);
  box-shadow: 0 1px 0 color-mix(in srgb, var(--dw-on-accent) 30%, transparent) inset,
  0 2px 10px color-mix(in srgb, var(--dw-primary) 15%, transparent);
}

.msg-body {
  min-width: 0;
  max-width: min(920px, 92%);
}

.msg-body--workflow {
  max-width: min(960px, 96%);
  width: 100%;
}
</style>
