<script setup lang="ts">
import {computed, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import ShortcutPanelDrawer from './ShortcutPanelDrawer.vue'
import NotificationDrawer from './NotificationDrawer.vue'
import AssistantDrawer from '@/features/ai/assistant/components/AssistantDrawer.vue'
import ResizeHandle from '@/core/components/ResizeHandle.vue'
import {DwIcon, shortcutRailDwIcon} from '@/core/icons'
import type {ExportTask} from '@/core/types'
import {SHORTCUT_RAIL_NAV_DEFS} from '@/features/layout/constants/shortcut-rail'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import {isShortcutPanelEnabled} from '@/features/plugin/services/plugin-registry.service'
import {useShortcutPanelStore} from '@/features/layout/stores/shortcut-panel-store'
import {useMigrationTaskStore} from '@/features/explorer/stores/migration-task-store'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useSidePanelResizeBounds, SHORTCUT_PANEL_RESIZE_MIN} from '@/core/composables/useSidePanelResizeBounds'
import {usePanelHeaderDrag} from '@/features/dock/composables/usePanelHeaderDrag'
import {useDockPlacementStore} from '@/features/dock/stores/dock-placement-store'
import DockDragGrip from '@/features/dock/components/DockDragGrip.vue'
import DockFloatActions from '@/features/dock/components/DockFloatActions.vue'

const props = withDefaults(
    defineProps<{
      /** Dock edge: right is classic. */
      edge?: 'left' | 'right'
      /**
       * full — stripe + tool window (AI / other modules)
       * stripe — icons only, always on the right of the database workbench
       * panel — tool window only (left / right / float)
       */
      chrome?: 'full' | 'stripe' | 'panel'
    }>(),
    {edge: 'right', chrome: 'full'},
)

const {t} = useI18n()
const layout = useLayoutStore()
const appConfig = useAppConfigStore()
const pluginStore = usePluginStore()
const shortcutPanel = useShortcutPanelStore()
const migrationTasks = useMigrationTaskStore()
const explorer = useExplorerStore()
const dock = useDockPlacementStore()
const {onPointerDown: onStripeGripPointerDown} = usePanelHeaderDrag('shortcut')

const navDefs = SHORTCUT_RAIL_NAV_DEFS
const showStripe = computed(() => props.chrome !== 'panel')
const showPanel = computed(() => props.chrome !== 'stripe')
const isFloating = computed(() => dock.isPanelFloating('shortcut'))

const items = computed(() =>
    navDefs
        .filter((item) => appConfig.isShortcutVisible(item.id))
        .filter((item) => isShortcutPanelEnabled(item.id, (id) => pluginStore.isEnabled(id)))
        .map((item) => ({
          ...item,
          label: t(item.labelKey),
          caption: t(item.captionKey),
          pending:
              item.id === 'export'
                  ? shortcutPanel.exportTasks.some((task: ExportTask) => task.status === 'running')
                  : item.id === 'migration'
                      ? migrationTasks.isRunning
                      : false,
        })),
)

const toolWindowOpen = computed(
    () =>
        layout.showNotificationDrawer
        || layout.showAssistantDrawer
        || layout.activeShortcutPanel,
)

/** Pop-out on stripe when docked and no drawer; float chrome lives on the panel. */
const showStripeFloatActions = computed(
    () => showStripe.value && !toolWindowOpen.value && !isFloating.value,
)

const panelOpen = computed(() => showPanel.value && toolWindowOpen.value)

/** Avoid an empty workbench-edge flex slot (extra panel-gap) when the drawer is closed. */
const showEdge = computed(() => panelOpen.value || (showStripe.value && items.value.length > 0))

const panelWidth = computed({
    get: () => appConfig.shortcutPanelWidth,
    set: (width: number) => appConfig.setShortcutPanelWidth(width),
})

/** Docked explorer width (0 when floated / hidden) — protects the center column. */
const shortcutPeerWidth = computed(() => {
    if (dock.isPanelFloating('explorer')) return 0
    if (!appConfig.showExplorerPanel) return 0
    return explorer.width
})

const {min: shortcutResizeMin, max: shortcutResizeMax} = useSidePanelResizeBounds({
    min: SHORTCUT_PANEL_RESIZE_MIN,
    peerWidth: shortcutPeerWidth,
})

watch(shortcutResizeMax, (max) => {
    if (panelWidth.value > max) panelWidth.value = max
})

/** Docked panel uses configured width; float panel fills the host. */
const panelStyle = computed(() =>
    isFloating.value ? undefined : {width: `${panelWidth.value}px`},
)
</script>

<template>
  <div
      v-if="showEdge"
      class="workbench-edge"
      :class="{
        'workbench-edge--left': edge === 'left',
        'workbench-edge--float-panel': chrome === 'panel' && isFloating,
        'workbench-edge--stripe-only': chrome === 'stripe',
      }"
  >
    <div
        v-if="panelOpen"
        class="workbench-edge__panel"
        :style="panelStyle"
    >
      <NotificationDrawer v-if="layout.showNotificationDrawer" embedded header-draggable/>
      <AssistantDrawer v-else-if="layout.showAssistantDrawer" embedded header-draggable/>
      <ShortcutPanelDrawer v-else-if="layout.activeShortcutPanel" header-draggable/>
    </div>
    <ResizeHandle
        v-if="panelOpen && !isFloating"
        v-model="panelWidth"
        :invert="edge === 'right'"
        :min="shortcutResizeMin"
        :max="shortcutResizeMax"
        class="workbench-edge__resize"
        :class="edge === 'right' ? 'panel-resize-handle--leading' : 'panel-resize-handle--trailing'"
    />

    <aside
        v-if="showStripe && items.length > 0"
        class="tool-stripe tool-stripe--right dw-panel-hover-chrome"
    >
      <DockDragGrip
          variant="bar"
          class="tool-stripe__grip"
          @pointerdown="onStripeGripPointerDown"
      />
      <DockFloatActions
          v-if="showStripeFloatActions"
          class="tool-stripe__float-actions"
          panel="shortcut"
      />
      <nav class="tool-stripe__group" :aria-label="t('shortcut.railLabel')">
        <button
            v-for="item in items"
            :key="item.id"
            class="tool-btn tool-btn--stack"
            :class="{ active: layout.activeShortcutPanel === item.id }"
            type="button"
            :aria-label="item.label"
            :aria-pressed="layout.activeShortcutPanel === item.id"
            @click="layout.toggleShortcutPanel(item.id)"
        >
          <span class="tool-btn__graphic">
            <DwIcon :name="shortcutRailDwIcon(item.id)" size="rail" :stroke-width="1.7"/>
            <span v-if="item.pending" class="tool-btn__dot" aria-hidden="true"/>
          </span>
          <span class="tool-btn__caption">{{ item.caption }}</span>
        </button>
      </nav>
    </aside>
  </div>
</template>

<style scoped>
.workbench-edge--left {
  flex-direction: row;
}

.workbench-edge--float-panel {
  width: 100%;
  height: 100%;
  gap: 0;
}

.workbench-edge--float-panel .workbench-edge__panel {
  flex: 1;
  width: auto;
  min-width: 0;
}

.workbench-edge--stripe-only {
  gap: 0;
}

.tool-stripe__grip {
  align-self: center;
  margin: 8px 0 4px;
}

.tool-stripe__float-actions {
  align-self: center;
}
</style>
