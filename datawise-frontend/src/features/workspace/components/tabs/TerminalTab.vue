<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {formatShortcutLabel} from '@/features/layout/composables/useAppShortcutListener'
import TerminalView from '@/features/terminal/components/TerminalView.vue'
import {
    defaultNativeShellLabel,
    getTerminalRuntimeMode,
    resolveTerminalRuntimeMode,
} from '@/features/terminal/services/terminal-runtime'
import IconButton from '@/core/components/IconButton.vue'
import {DwIcon} from '@/core/icons'
import type {WorkspaceTab} from '@/core/types'

defineProps<{ tab: WorkspaceTab }>()
const {t} = useI18n()
const terminalRef = ref<InstanceType<typeof TerminalView>>()
const runtimeMode = ref(getTerminalRuntimeMode())

const toggleShortcut = computed(() => formatShortcutLabel('app.toggleTerminal'))
const tabSubtitle = computed(() => {
    if (runtimeMode.value === 'native') {
        return t('terminal.nativeMode', {shell: defaultNativeShellLabel()})
    }
    return t('terminal.subtitle')
})

function clearTerminal() {
  terminalRef.value?.clear()
}

onMounted(async () => {
  runtimeMode.value = await resolveTerminalRuntimeMode()
  terminalRef.value?.focus()
})
</script>

<template>
  <!--
    配方：wb-terminal（满高终端；不强制 WorkbenchListPage）
    AURA-X: [Modify] - 标注配方；pane min-height → token
    Protection: 功能完整性已验证，无简化行为
    人格: [@前端艺术家]
  -->
  <div class="terminal-tab dw-workbench-page dw-workbench-page--terminal" data-wb-recipe="wb-terminal">
    <header class="dw-workbench-page__head">
      <div class="dw-workbench-page__title dw-workbench-page__title--with-icon">
        <span class="dw-workbench-page__icon dw-workbench-page__icon--terminal" aria-hidden="true">
          <DwIcon name="terminal" size="lg" :stroke-width="1.7"/>
        </span>
        <div>
          <h2>{{ t('terminal.title') }}</h2>
          <p>{{ tabSubtitle }}</p>
        </div>
      </div>
      <div class="dw-workbench-page__actions">
        <kbd v-if="toggleShortcut" class="dw-workbench-page__kbd">{{ toggleShortcut }}</kbd>
        <IconButton size="sm" :title="t('terminal.clear')" @click="clearTerminal">
          <DwIcon name="delete" size="sm" :stroke-width="1.5"/>
        </IconButton>
      </div>
    </header>
    <div class="terminal-tab__main dw-workbench-page__body">
      <TerminalView ref="terminalRef" class="terminal-tab__body dw-workbench-terminal"/>
    </div>
  </div>
</template>

<style scoped>
.terminal-tab {
  min-height: 0;
  min-width: 0;
}

.terminal-tab__body {
  min-height: var(--dw-wb-pane-min-height);
}
</style>
