<script setup lang="ts">
/** Compact chrome for arranging / docking / opacity of floating tab windows. */
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {IconButton} from '@/core/components'
import {DwIcon} from '@/core/icons'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {
  TAB_FLOAT_OPACITY_MAX,
  TAB_FLOAT_OPACITY_MIN,
} from '@/features/workspace/services/workspace-tab-float.service'

const props = defineProps<{
  bounds: {width: number; height: number}
}>()

const {t} = useI18n()
const workspace = useWorkspaceStore()

const floatCount = computed(() => Object.keys(workspace.tabFloats).length)
const visible = computed(() => floatCount.value > 0)

const opacityPercent = computed({
  get: () => Math.round(workspace.tabFloatOpacity * 100),
  set: (value: number) => workspace.setTabFloatOpacity(value / 100),
})

function tile() {
  workspace.arrangeTabFloats('tile', props.bounds)
}

function cascade() {
  workspace.arrangeTabFloats('cascade', props.bounds)
}

function dockAll() {
  workspace.dockAllTabFloats()
}

function onOpacityInput(event: Event) {
  const el = event.target as HTMLInputElement
  opacityPercent.value = Number(el.value)
}
</script>

<template>
  <div
      v-if="visible"
      class="floating-tab-toolbar"
      role="toolbar"
      :aria-label="t('workspace.tabFloatToolbar')"
  >
    <span class="floating-tab-toolbar__count">{{ floatCount }}</span>

    <label class="floating-tab-toolbar__opacity" :title="t('workspace.tabFloatOpacity')">
      <span class="floating-tab-toolbar__opacity-label">{{ opacityPercent }}%</span>
      <input
          class="floating-tab-toolbar__slider"
          type="range"
          :min="Math.round(TAB_FLOAT_OPACITY_MIN * 100)"
          :max="Math.round(TAB_FLOAT_OPACITY_MAX * 100)"
          step="1"
          :value="opacityPercent"
          :aria-label="t('workspace.tabFloatOpacity')"
          @input="onOpacityInput"
      />
    </label>

    <span class="floating-tab-toolbar__sep" aria-hidden="true"/>

    <IconButton size="sm" :title="t('workspace.tabFloatTile')" @click="tile">
      <DwIcon name="layout" size="sm" :stroke-width="1.6"/>
    </IconButton>
    <IconButton size="sm" :title="t('workspace.tabFloatCascade')" @click="cascade">
      <DwIcon name="layers" size="sm" :stroke-width="1.6"/>
    </IconButton>
    <IconButton size="sm" :title="t('workspace.tabFloatDockAll')" @click="dockAll">
      <DwIcon name="pin" size="sm" :stroke-width="1.6"/>
    </IconButton>
  </div>
</template>

<style scoped>
.floating-tab-toolbar {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 40;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px 4px 3px 8px;
  border: 1px solid var(--dw-panel-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--dw-bg-panel) 88%, transparent);
  box-shadow: var(--dw-panel-shadow);
  backdrop-filter: blur(10px);
  pointer-events: auto;
}

.floating-tab-toolbar__count {
  min-width: 1.1em;
  margin-right: 2px;
  font-size: var(--dw-font-size-badge);
  font-weight: 700;
  color: var(--dw-text-muted);
  font-variant-numeric: tabular-nums;
}

.floating-tab-toolbar__opacity {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0 4px 0 2px;
  cursor: default;
}

.floating-tab-toolbar__opacity-label {
  min-width: 2.4em;
  font-size: var(--dw-font-size-label);
  font-weight: 600;
  color: var(--dw-text-secondary);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.floating-tab-toolbar__slider {
  width: 72px;
  height: 4px;
  margin: 0;
  accent-color: var(--dw-accent);
  cursor: pointer;
}

.floating-tab-toolbar__sep {
  width: 1px;
  height: 14px;
  margin: 0 4px;
  background: var(--dw-border-light);
}
</style>
