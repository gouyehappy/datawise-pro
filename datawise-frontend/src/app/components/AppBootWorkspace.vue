<script setup lang="ts">
/** 桌面 Shell-first：主区静默骨架（文案仅在状态栏，避免布局跳动） */
import {useStartupPhaseLabel} from '@/app/composables/useStartupPhaseLabel'

const statusText = useStartupPhaseLabel()
</script>

<template>
  <div class="app-boot-workspace" role="status" aria-live="polite" :aria-label="statusText">
    <div class="app-boot-workspace__explorer" aria-hidden="true">
      <div class="app-boot-workspace__skel app-boot-workspace__skel--lg"/>
      <div class="app-boot-workspace__skel"/>
      <div class="app-boot-workspace__skel"/>
      <div class="app-boot-workspace__skel app-boot-workspace__skel--short"/>
    </div>
    <div class="app-boot-workspace__editor" aria-hidden="true">
      <div class="app-boot-workspace__tabs">
        <div class="app-boot-workspace__skel app-boot-workspace__skel--tab"/>
        <div class="app-boot-workspace__skel app-boot-workspace__skel--tab app-boot-workspace__skel--dim"/>
      </div>
      <div class="app-boot-workspace__pane">
        <div class="app-boot-workspace__skel app-boot-workspace__skel--line"/>
        <div class="app-boot-workspace__skel app-boot-workspace__skel--line"/>
        <div class="app-boot-workspace__skel app-boot-workspace__skel--line app-boot-workspace__skel--short"/>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-boot-workspace {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  min-height: 0;
  background: var(--dw-bg-editor);
  overflow: hidden;
}

.app-boot-workspace__explorer {
  flex-shrink: 0;
  width: min(240px, 28%);
  padding: 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-right: 1px solid var(--dw-border-light);
  background: var(--dw-bg-panel);
}

.app-boot-workspace__editor {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.app-boot-workspace__tabs {
  display: flex;
  gap: 8px;
  padding: 10px 14px 0;
  border-bottom: 1px solid var(--dw-border-light);
  background: var(--dw-tab-bar-bg);
}

.app-boot-workspace__pane {
  flex: 1;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.app-boot-workspace__skel {
  height: 10px;
  border-radius: var(--dw-control-radius);
  background: color-mix(in srgb, var(--dw-text) 7%, var(--dw-bg-hover));
  animation: app-boot-workspace-pulse 1.8s ease-in-out infinite;
}

.app-boot-workspace__skel--lg {
  height: 14px;
  width: 72%;
}

.app-boot-workspace__skel--short {
  width: 46%;
}

.app-boot-workspace__skel--tab {
  width: 88px;
  height: var(--dw-density-xs);
  margin-bottom: 8px;
  border-radius: var(--dw-control-radius) var(--dw-control-radius) 0 0;
}

.app-boot-workspace__skel--dim {
  opacity: 0.55;
  animation-delay: 0.35s;
}

.app-boot-workspace__skel--line {
  height: 12px;
}

.app-boot-workspace__skel--line:nth-child(2) {
  width: 88%;
  animation-delay: 0.2s;
}

.app-boot-workspace__skel--line:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes app-boot-workspace-pulse {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 0.95; }
}
</style>
