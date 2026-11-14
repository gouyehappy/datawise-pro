<script setup lang="ts">
import {computed} from 'vue'
import ShortcutRail from '@/features/layout/components/ShortcutRail.vue'
import TerminalPane from '@/features/layout/components/TerminalPane.vue'
import FloatingPanelHost from '@/features/dock/components/FloatingPanelHost.vue'
import {useDockPlacementStore} from '@/features/dock/stores/dock-placement-store'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'

const props = withDefaults(
    defineProps<{
      /**
       * PERF-06: when the shell host is kept mounted (v-show) while another shell
       * is active, drop Terminal/Shortcut chrome so they do not fight the database shell.
       */
      pageActive?: boolean
    }>(),
    {pageActive: true},
)

const appConfig = useAppConfigStore()
const dock = useDockPlacementStore()
const shortcutFloating = computed(() => dock.isPanelFloating('shortcut'))
const showSideChrome = computed(() => props.pageActive)
</script>

<template>
  <div class="module-workbench">
    <slot name="side"/>
    <div class="module-workbench__center">
      <main class="module-panel">
        <slot/>
      </main>
      <TerminalPane v-if="showSideChrome"/>
      <slot name="bottom"/>
    </div>
    <template v-if="showSideChrome && appConfig.showShortcutRail">
      <FloatingPanelHost
          v-if="shortcutFloating"
          panel="shortcut"
          :teleport="true"
          :floating="true"
      >
        <ShortcutRail edge="right" chrome="panel"/>
      </FloatingPanelHost>
      <ShortcutRail v-else edge="right" chrome="full"/>
    </template>
  </div>
</template>
