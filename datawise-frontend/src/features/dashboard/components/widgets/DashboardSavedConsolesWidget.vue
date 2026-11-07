<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import DashboardWidgetFrame from '@/features/dashboard/components/DashboardWidgetFrame.vue'
import {EmptyState} from '@/core/components'
import '@/features/dashboard/styles/dashboard-widgets.css'

interface SavedConsoleItem {
  id: string
  name: string
  connectionName: string
  updatedAt: string
  sql?: string
}

defineProps<{
  editMode: boolean
  isDragging: boolean
  isDropTarget: boolean
  consoles: SavedConsoleItem[]
}>()

const emit = defineEmits<{
  openConsole: [item: SavedConsoleItem]
  'drag-start': [event: DragEvent]
  'drag-over': []
  drop: []
  'drag-end': []
}>()

const {t} = useI18n()
</script>

<template>
  <DashboardWidgetFrame
      :edit-mode="editMode"
      :is-dragging="isDragging"
      :is-drop-target="isDropTarget"
      @drag-start="emit('drag-start', $event)"
      @drag-over="emit('drag-over')"
      @drop="emit('drop')"
      @drag-end="emit('drag-end')"
  >
    <header class="dash-card__head">
      <h2 class="dash-card__title">{{ t('dashboard.savedConsoles') }}</h2>
      <span class="dash-card__badge">{{ consoles.length }}</span>
    </header>
    <div class="dash-card__body">
      <EmptyState v-if="!consoles.length" embedded :title="t('dashboard.noSavedConsoles')"/>
      <button
          v-for="item in consoles"
          :key="item.id"
          class="dash-item"
          type="button"
          @click="emit('openConsole', item)"
      >
        <span class="dash-item__title">{{ item.name }}</span>
        <span class="dash-item__meta">{{ item.connectionName }} · {{ item.updatedAt }}</span>
      </button>
    </div>
  </DashboardWidgetFrame>
</template>
