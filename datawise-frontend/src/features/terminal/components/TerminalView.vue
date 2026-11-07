<script setup lang="ts">
import {onMounted, ref} from 'vue'
import MockTerminalPane from '@/features/terminal/components/MockTerminalPane.vue'
import NativeTerminalPane from '@/features/terminal/components/NativeTerminalPane.vue'
import TerminalConnectionHint from '@/features/terminal/components/TerminalConnectionHint.vue'
import {isNativeTerminalAvailable, isRealTerminalAvailable} from '@/features/terminal/services/native-terminal'

const props = withDefaults(
    defineProps<{ compact?: boolean }>(),
    {compact: false},
)

const useNative = ref(isNativeTerminalAvailable())
const ready = ref(isNativeTerminalAvailable())
const paneRef = ref<InstanceType<typeof NativeTerminalPane> | InstanceType<typeof MockTerminalPane>>()

onMounted(async () => {
  // Packaged desktop may open the panel before backend/session is ready — retry briefly.
  for (let attempt = 0; attempt < 5 && !useNative.value; attempt += 1) {
    useNative.value = await isRealTerminalAvailable()
    if (useNative.value) break
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  ready.value = true
})

defineExpose({
  focus: () => paneRef.value?.focus(),
  clear: () => paneRef.value?.clear(),
})
</script>

<template>
  <div
      class="terminal"
      :class="{ 'terminal--compact': compact, 'terminal--native': useNative }"
  >
    <div v-if="!ready" class="terminal__loading" aria-hidden="true"/>
    <div v-else class="terminal__pane">
      <NativeTerminalPane v-if="useNative" ref="paneRef"/>
      <MockTerminalPane v-else ref="paneRef" class="terminal__mock" :class="{ 'terminal__mock--compact': compact }"/>
    </div>
    <TerminalConnectionHint v-if="ready && useNative"/>
  </div>
</template>

<style scoped>
.terminal {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 200px;
  overflow: hidden;
}

.terminal--compact {
  min-height: 0;
}

.terminal--native {
  border: 1px solid var(--dw-terminal-border);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-terminal-bg);
}

.terminal__pane {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.terminal__loading {
  flex: 1;
  min-height: 0;
  background: var(--dw-terminal-bg);
}

.terminal--native .terminal__pane {
  min-height: 0;
}

.terminal--native.terminal--compact {
  border: none;
  border-radius: var(--dw-control-radius);
}

.terminal__mock {
  flex: 1;
  min-height: 0;
}

.terminal__mock--compact {
  border: none;
  border-radius: var(--dw-control-radius);
}
</style>
