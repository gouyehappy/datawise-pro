<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {
    DOCK_MINIMAP_FLOAT_SIDE,
    DOCK_MINIMAP_FRAME_SLOTS,
    DOCK_MINIMAP_TITLE_KEY,
    isMinimapDropSide,
    minimapSideLabelKey,
    type MinimapDropSide,
} from '@/features/dock/components/dock-minimap.config'
import {useDockPlacementStore} from '@/features/dock/stores/dock-placement-store'
import {DOCK_DROP_ZONE_Z_INDEX} from '@/features/dock/dock-z'
import type {DockDragPanel} from '@/features/dock/types/dock.types'

const {t} = useI18n()
const dock = useDockPlacementStore()

const panel = computed(() => dock.draggingPanel)

const title = computed(() => {
    const id = panel.value
    return id ? t(DOCK_MINIMAP_TITLE_KEY[id]) : ''
})

const currentSide = computed(() => {
    const id = panel.value
    return id ? dock.placement[id] : null
})

const hoverTarget = computed(() => {
    const hover = dock.hoverTarget
    if (!panel.value || !hover || hover.panel !== panel.value) return ''
    const key = minimapSideLabelKey(hover.side)
    return key ? t(key) : ''
})

function canDrop(side: string) {
    return Boolean(panel.value && isMinimapDropSide(panel.value, side))
}

function isActive(side: string) {
    const hover = dock.hoverTarget
    return hover?.panel === panel.value && hover.side === side
}

function isCurrent(side: string) {
    return currentSide.value === side
}

function slotClass(side: MinimapDropSide) {
    const droppable = canDrop(side)
    return {
        [`dock-minimap__slot--${side}`]: true,
        'is-drop': droppable,
        'is-inert': !droppable,
        'is-active': droppable && isActive(side),
        'is-current': droppable && isCurrent(side) && !isActive(side),
    }
}

function dropAttrs(side: MinimapDropSide, forPanel: DockDragPanel) {
    if (!canDrop(side)) return undefined
    return {
        'data-dock-drop': side,
        'data-dock-for': forPanel,
    }
}
</script>

<template>
  <Teleport to="body">
    <div
        v-if="panel"
        class="dock-drop-overlay"
        aria-hidden="true"
        :style="{ zIndex: DOCK_DROP_ZONE_Z_INDEX }"
    >
      <div class="dock-minimap" role="presentation">
        <header class="dock-minimap__head">
          <p class="dock-minimap__title">
            {{ title }}
            <span v-if="hoverTarget" class="dock-minimap__title-target">{{ hoverTarget }}</span>
          </p>
          <kbd class="dock-minimap__kbd" :title="t('dock.minimap.escHint')">Esc</kbd>
        </header>

        <div class="dock-minimap__stage">
          <div class="dock-minimap__frame">
            <div
                v-for="slot in DOCK_MINIMAP_FRAME_SLOTS"
                :key="slot.side"
                class="dock-minimap__slot"
                :class="slotClass(slot.side)"
                v-bind="dropAttrs(slot.side, panel)"
            >
              <span
                  v-if="slot.showTabs"
                  class="dock-minimap__editor"
                  aria-hidden="true"
              >
                <span class="dock-minimap__tabbar">
                  <i class="is-on"/><i/><i/>
                </span>
                <span class="dock-minimap__lines">
                  <i/><i/><i/><i/>
                </span>
              </span>
            </div>
          </div>

          <div
              class="dock-minimap__slot dock-minimap__slot--float"
              :class="slotClass(DOCK_MINIMAP_FLOAT_SIDE)"
              v-bind="dropAttrs(DOCK_MINIMAP_FLOAT_SIDE, panel)"
          >
            <span class="dock-minimap__float-bar" aria-hidden="true"/>
            <span class="dock-minimap__float-body" aria-hidden="true"/>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.dock-drop-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 92px;
}

.dock-minimap {
  pointer-events: auto;
  width: min(360px, calc(100vw - 32px));
  padding: 10px 12px 12px;
  border-radius: var(--dw-menu-radius);
  border: 1px solid color-mix(in srgb, var(--dw-border-light) 80%, transparent);
  background: color-mix(in srgb, var(--dw-bg-panel) 93%, transparent);
  box-shadow:
      0 1px 0 color-mix(in srgb, var(--dw-on-accent) 6%, transparent) inset,
      0 18px 40px color-mix(in srgb, var(--dw-text) 36%, transparent);
  backdrop-filter: blur(16px) saturate(1.1);
}

.dock-minimap__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.dock-minimap__title {
  margin: 0;
  min-width: 0;
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  font-size: var(--dw-text-sm);
  font-weight: 600;
  color: var(--dw-text-primary);
}

.dock-minimap__title-target {
  font-size: var(--dw-text-xs);
  font-weight: 600;
  color: var(--dw-primary);
}

.dock-minimap__title-target::before {
  content: '·';
  margin-right: 8px;
  color: var(--dw-text-muted);
  font-weight: 500;
}

.dock-minimap__kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-width: 26px;
  height: 18px;
  padding: 0 5px;
  border-radius: var(--dw-control-radius-sm);
  border: 1px solid color-mix(in srgb, var(--dw-border-light) 78%, transparent);
  background: color-mix(in srgb, var(--dw-bg) 68%, var(--dw-bg-panel));
  font-family: inherit;
  font-size: var(--dw-font-size-badge);
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--dw-text-muted);
}

.dock-minimap__stage {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 56px;
  gap: 10px;
  align-items: center;
}

.dock-minimap__frame {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 40px;
  grid-template-rows: minmax(0, 1fr) 32px;
  grid-template-areas:
      'left center right'
      'left bottom right';
  gap: 4px;
  height: 128px;
  min-width: 0;
  padding: 6px;
  border-radius: var(--dw-panel-radius);
  background: color-mix(in srgb, var(--dw-bg) 84%, var(--dw-text));
  border: 1px solid color-mix(in srgb, var(--dw-text-primary) 7%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--dw-on-accent) 4%, transparent);
}

.dock-minimap__slot--left { grid-area: left; }
.dock-minimap__slot--center { grid-area: center; }
.dock-minimap__slot--right { grid-area: right; }
.dock-minimap__slot--bottom { grid-area: bottom; }

.dock-minimap__slot {
  position: relative;
  min-width: 0;
  min-height: 0;
  border-radius: var(--dw-control-radius-sm);
  background: color-mix(in srgb, var(--dw-bg-panel) 42%, transparent);
  transition:
      background 140ms ease,
      box-shadow 140ms ease,
      outline-color 140ms ease,
      opacity 140ms ease;
}

.dock-minimap__slot.is-inert {
  pointer-events: none;
  opacity: 0.5;
}

.dock-minimap__slot.is-drop {
  background: color-mix(in srgb, var(--dw-primary) 9%, var(--dw-bg-panel));
}

.dock-minimap__slot.is-current {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dw-primary) 36%, transparent);
  background: color-mix(in srgb, var(--dw-primary) 13%, var(--dw-bg-panel));
}

.dock-minimap__slot.is-active {
  background: color-mix(in srgb, var(--dw-primary) 22%, var(--dw-bg-panel));
  box-shadow:
      inset 0 0 0 1px color-mix(in srgb, var(--dw-primary) 55%, transparent),
      0 0 0 1px color-mix(in srgb, var(--dw-primary) 18%, transparent);
}

.dock-minimap__editor {
  display: flex;
  flex-direction: column;
  gap: 9px;
  height: 100%;
  padding: 9px 11px 10px;
}

.dock-minimap__tabbar {
  display: flex;
  gap: 3px;
  width: 52%;
  max-width: 64px;
  height: 4px;
}

.dock-minimap__tabbar i {
  flex: 1;
  border-radius: 2px 2px 1px 1px;
  background: color-mix(in srgb, var(--dw-text-muted) 26%, transparent);
}

.dock-minimap__tabbar i.is-on {
  flex: 1.4;
  background: color-mix(in srgb, var(--dw-text-muted) 44%, transparent);
}

.dock-minimap__slot--center.is-drop .dock-minimap__tabbar i.is-on,
.dock-minimap__slot--center.is-active .dock-minimap__tabbar i.is-on {
  background: color-mix(in srgb, var(--dw-primary) 68%, transparent);
}

.dock-minimap__lines {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 78%;
}

.dock-minimap__lines i {
  display: block;
  height: 2px;
  border-radius: 1px;
  background: color-mix(in srgb, var(--dw-text-muted) 16%, transparent);
}

.dock-minimap__lines i:nth-child(2) { width: 90%; }
.dock-minimap__lines i:nth-child(3) { width: 72%; }
.dock-minimap__lines i:nth-child(4) { width: 58%; }

.dock-minimap__slot--float {
  display: flex;
  flex-direction: column;
  align-self: center;
  gap: 4px;
  height: 64px;
  padding: 6px 7px 7px;
  border-radius: var(--dw-control-radius);
  background: color-mix(in srgb, var(--dw-bg-panel) 88%, transparent);
  box-shadow:
      0 1px 0 color-mix(in srgb, var(--dw-on-accent) 5%, transparent) inset,
      0 4px 12px color-mix(in srgb, var(--dw-text) 24%, transparent);
  outline: 1px dashed color-mix(in srgb, var(--dw-text-muted) 34%, transparent);
  outline-offset: -1px;
}

.dock-minimap__slot--float.is-drop {
  outline-color: color-mix(in srgb, var(--dw-primary) 34%, transparent);
}

.dock-minimap__slot--float.is-current,
.dock-minimap__slot--float.is-active {
  outline-style: solid;
}

.dock-minimap__float-bar {
  height: 2px;
  width: 14px;
  margin: 0 auto;
  border-radius: var(--dw-radius-pill);
  background: color-mix(in srgb, var(--dw-text-muted) 46%, transparent);
  flex-shrink: 0;
}

.dock-minimap__float-body {
  flex: 1;
  border-radius: var(--dw-control-radius-sm);
  background: color-mix(in srgb, var(--dw-text-muted) 12%, transparent);
}
</style>
