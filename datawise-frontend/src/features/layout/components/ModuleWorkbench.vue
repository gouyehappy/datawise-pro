<script setup lang="ts">
import {computed} from 'vue'
import ShortcutRail from '@/features/layout/components/ShortcutRail.vue'
import TerminalPane from '@/features/layout/components/TerminalPane.vue'
import FloatingPanelHost from '@/features/dock/components/FloatingPanelHost.vue'
import {useDockPlacementStore} from '@/features/dock/stores/dock-placement-store'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'

const appConfig = useAppConfigStore()
const dock = useDockPlacementStore()
const shortcutFloating = computed(() => dock.isPanelFloating('shortcut'))
</script>

<template>
  <div class="module-workbench">
    <slot name="side"/>
    <div class="module-workbench__center">
      <main class="module-panel">
        <slot/>
      </main>
      <TerminalPane/>
      <slot name="bottom"/>
    </div>
    <FloatingPanelHost
        v-if="appConfig.showShortcutRail && shortcutFloating"
        panel="shortcut"
        :teleport="true"
        :floating="true"
    >
      <ShortcutRail edge="right" chrome="panel"/>
    </FloatingPanelHost>
    <ShortcutRail v-else-if="appConfig.showShortcutRail" edge="right" chrome="full"/>
  </div>
</template>
