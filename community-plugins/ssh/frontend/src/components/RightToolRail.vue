<script setup lang="ts">
/**
 * Motty-style right tool rail (~40px): secondary session actions as a quiet icon column.
 */
import {
  Container,
  Disc,
  Film,
  Gauge,
  History,
  Lock,
  Network,
  Server,
  Sparkles,
  SquareTerminal,
  ListChecks,
} from "@lucide/vue";

defineProps<{
  connected: boolean;
  sessionReady: boolean;
  isJumpServerMode: boolean;
  canRecord: boolean;
  recordingActive: boolean;
  monitorOpen: boolean;
  copilotOpen: boolean;
  dockerOpen: boolean;
  historyOpen: boolean;
  otpOpen: boolean;
  assetsOpen: boolean;
  batchBarOpen: boolean;
  t: (key: string, values?: Record<string, string | number>) => string;
}>();

const emit = defineEmits<{
  (e: "forwards"): void;
  (e: "docker"): void;
  (e: "history"): void;
  (e: "otp"): void;
  (e: "assets"): void;
  (e: "command"): void;
  (e: "batch"): void;
  (e: "record"): void;
  (e: "recordings"): void;
  (e: "monitor"): void;
  (e: "copilot"): void;
}>();
</script>

<template>
  <aside class="right-tool-rail" :aria-label="t('rightRail.aria')">
    <div class="right-tool-rail-group">
      <button
        type="button"
        class="icon-button icon-neutral"
        :class="{ 'is-active': monitorOpen }"
        :title="t('monitorDock.toggle')"
        :aria-pressed="monitorOpen"
        :disabled="!connected"
        @click="emit('monitor')"
      ><Gauge /></button>
      <button
        type="button"
        class="icon-button icon-neutral"
        :class="{ 'is-active': copilotOpen }"
        :title="t('copilot.openDock')"
        :aria-pressed="copilotOpen"
        :disabled="!connected"
        @click="emit('copilot')"
      ><Sparkles /></button>
    </div>
    <div class="right-tool-rail-sep" aria-hidden="true" />
    <div class="right-tool-rail-group">
      <button
        type="button"
        class="icon-button icon-neutral"
        :title="t('forwards.title')"
        :disabled="!sessionReady"
        @click="emit('forwards')"
      ><Network /></button>
      <button
        v-if="isJumpServerMode"
        type="button"
        class="icon-button icon-neutral"
        :class="{ 'is-active': assetsOpen }"
        :title="t('jumpserver.title')"
        :aria-pressed="assetsOpen"
        :disabled="!connected"
        @click="emit('assets')"
      ><Server /></button>
      <button
        type="button"
        class="icon-button icon-neutral"
        :class="{ 'is-active': dockerOpen }"
        :title="t('docker.title')"
        :aria-pressed="dockerOpen"
        :disabled="!connected"
        @click="emit('docker')"
      ><Container /></button>
      <button
        type="button"
        class="icon-button icon-neutral"
        :class="{ 'is-active': historyOpen }"
        :title="t('historyPanel.titleShortcut')"
        :aria-pressed="historyOpen"
        :disabled="!connected"
        @click="emit('history')"
      ><History /></button>
      <button
        type="button"
        class="icon-button icon-neutral"
        :class="{ 'is-active': otpOpen }"
        :title="t('otp.title')"
        :aria-pressed="otpOpen"
        @click="emit('otp')"
      ><Lock /></button>
    </div>
    <div class="right-tool-rail-sep" aria-hidden="true" />
    <div class="right-tool-rail-group">
      <button
        type="button"
        class="icon-button icon-neutral"
        :title="t('commandTitle')"
        :disabled="!connected"
        @click="emit('command')"
      ><SquareTerminal /></button>
      <button
        type="button"
        class="icon-button icon-neutral"
        :class="{ 'is-active': batchBarOpen }"
        :title="t('batchSendTitle')"
        :aria-pressed="batchBarOpen"
        :disabled="!connected"
        @click="emit('batch')"
      ><ListChecks /></button>
      <button
        type="button"
        class="icon-button icon-neutral"
        :class="{ 'is-recording': recordingActive }"
        :title="recordingActive ? t('recordingStop') : t('recordingTitle')"
        :disabled="!canRecord"
        @click="emit('record')"
      ><Disc /></button>
      <button
        type="button"
        class="icon-button icon-neutral"
        :title="t('recordingsTitle')"
        @click="emit('recordings')"
      ><Film /></button>
    </div>
  </aside>
</template>
