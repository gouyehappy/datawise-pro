<script setup lang="ts">
/** Pop-out when docked (hover-chrome); pin / maximize / close when floated. */
import {useI18n} from 'vue-i18n'
import {IconButton} from '@/core/components'
import {DwIcon} from '@/core/icons'
import type {DockDragPanel} from '@/features/dock/types/dock.types'
import {useDockFloatChrome} from '@/features/dock/composables/useDockFloatChrome'

const props = defineProps<{
    panel: DockDragPanel
}>()

const {t} = useI18n()
const {isFloating, isMaximized, canClose, pinBack, popOut, toggleMaximize, closeFloat} =
    useDockFloatChrome(props.panel)
</script>

<template>
  <div
      v-if="isFloating || panel !== 'workspace'"
      class="dock-float-actions"
      @pointerdown.stop
      @click.stop
      @dblclick.stop
  >
    <template v-if="isFloating">
      <IconButton
          size="sm"
          :title="isMaximized ? t('dock.float.restore') : t('dock.float.maximize')"
          @click="toggleMaximize"
      >
        <DwIcon name="fullscreen" size="sm" :active="isMaximized" :stroke-width="1.6"/>
      </IconButton>
      <IconButton size="sm" :title="t('dock.float.pinBack')" @click="pinBack">
        <DwIcon name="pin" size="sm" :stroke-width="1.6"/>
      </IconButton>
      <IconButton
          v-if="canClose"
          size="sm"
          :title="t('dock.float.close')"
          @click="closeFloat"
      >
        <DwIcon name="x" size="sm" :stroke-width="1.6"/>
      </IconButton>
    </template>
    <span v-else class="dw-panel-hover-actions">
      <IconButton size="sm" :title="t('dock.float.popOut')" @click="popOut">
        <DwIcon name="open-external" size="sm" :stroke-width="1.6"/>
      </IconButton>
    </span>
  </div>
</template>

<style scoped>
.dock-float-actions {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  gap: 1px;
}
</style>
