<script setup lang="ts">
import {computed, nextTick, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {IconButton} from '@/core/components'
import {DwIcon} from '@/core/icons'
import ToolWindowShell from '@/features/layout/components/ToolWindowShell.vue'
import {formatShortcutLabel} from '@/features/layout/composables/useAppShortcutListener'
import TerminalView from '@/features/terminal/components/TerminalView.vue'
import {
    defaultNativeShellLabel,
    getTerminalRuntimeMode,
    resolveTerminalRuntimeMode,
} from '@/features/terminal/services/terminal-runtime'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {usePanelHeaderDrag} from '@/features/dock/composables/usePanelHeaderDrag'

const {t} = useI18n()
const layout = useLayoutStore()
const workspace = useWorkspaceStore()
const terminalRef = ref<InstanceType<typeof TerminalView>>()
const {onPointerDown: onDockHeaderPointerDown} = usePanelHeaderDrag('terminal')

const runtimeMode = ref(getTerminalRuntimeMode())
const panelSubtitle = computed(() => {
    if (runtimeMode.value === 'native') {
        return t('terminal.nativeMode', {shell: defaultNativeShellLabel()})
    }
    return t('terminal.demoMode')
})

const toggleShortcut = computed(() => formatShortcutLabel('app.toggleTerminal'))

watch(
    () => layout.showTerminalPanel,
    async (open) => {
      if (!open) return
      runtimeMode.value = await resolveTerminalRuntimeMode()
      await nextTick()
      terminalRef.value?.focus()
    },
)

onMounted(async () => {
  runtimeMode.value = await resolveTerminalRuntimeMode()
})

function openInTab() {
  workspace.openTerminal()
  layout.closeTerminalPanel()
}

function clearTerminal() {
  terminalRef.value?.clear()
}
</script>

<template>
  <section
      class="terminal-window dw-surface dw-panel-hover-chrome"
      :style="{ height: `${layout.terminalHeight}px` }"
      :aria-label="t('terminal.title')"
  >
    <ToolWindowShell
        class="terminal-window__shell"
        :title="t('terminal.title')"
        :subtitle="panelSubtitle"
        header-draggable
        dock-panel="terminal"
        @collapse="layout.closeTerminalPanel()"
        @header-pointerdown="onDockHeaderPointerDown"
    >
      <template #head-actions>
        <kbd v-if="toggleShortcut" class="terminal-window__shortcut">{{ toggleShortcut }}</kbd>
        <button class="terminal-window__link" type="button" @click="openInTab">
          {{ t('terminal.openInTab') }}
        </button>
        <IconButton size="sm" :title="t('terminal.clear')" @click="clearTerminal">
          <DwIcon name="delete" size="sm" :stroke-width="1.5"/>
        </IconButton>
      </template>

      <div class="terminal-window__body">
        <TerminalView ref="terminalRef" compact/>
      </div>
    </ToolWindowShell>
  </section>
</template>

<style scoped>
.terminal-window {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  min-height: 0;
}

.terminal-window__shell {
  flex: 1;
  min-height: 0;
}

.terminal-window__shell :deep(.tool-window) {
  height: 100%;
  min-height: 0;
}

.terminal-window__shortcut {
  padding: var(--dw-space-1) var(--dw-space-3);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius-sm);
  background: var(--dw-bg-muted);
  font-family: var(--dw-mono);
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.terminal-window__link {
  padding: var(--dw-space-2) var(--dw-space-5);
  border: none;
  border-radius: var(--dw-control-radius-sm);
  background: transparent;
  color: var(--dw-primary);
  font-size: var(--dw-text-xs);
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
}

.terminal-window__link:hover {
  background: var(--dw-primary-soft);
}

.terminal-window__body {
  height: 100%;
  min-height: 0;
  padding: var(--dw-space-4) var(--dw-console-chrome-inset) var(--dw-space-5);
  box-sizing: border-box;
}
</style>
