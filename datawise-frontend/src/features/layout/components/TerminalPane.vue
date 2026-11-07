<script setup lang="ts">
import {computed} from 'vue'
import TerminalToolWindow from '@/features/layout/components/TerminalToolWindow.vue'
import ResizeHandle from '@/core/components/ResizeHandle.vue'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useDockPlacementStore} from '@/features/dock/stores/dock-placement-store'

const layout = useLayoutStore()
const dock = useDockPlacementStore()

/** Bottom dock only — side/float terminals are hosted by MainContent. */
const showBottomTerminal = computed(
    () => layout.showTerminalPanel && dock.terminalSide === 'bottom',
)
</script>

<template>
  <div v-if="showBottomTerminal" class="terminal-pane">
    <ResizeHandle
        :model-value="layout.terminalHeight"
        axis="vertical"
        :min="160"
        :max="520"
        class="terminal-pane__resize"
        @update:model-value="layout.setTerminalHeight"
    />
    <TerminalToolWindow/>
  </div>
</template>

<style scoped>
.terminal-pane {
  position: relative;
  flex-shrink: 0;
  min-height: 0;
}

.terminal-pane :deep(.terminal-pane__resize) {
  position: absolute;
  top: calc(var(--dw-splitter-size) * -0.5);
  left: 0;
  right: 0;
  z-index: var(--dw-z-raised);
  width: auto;
  height: var(--dw-splitter-size);
  transform: translateY(-50%);
}
</style>
