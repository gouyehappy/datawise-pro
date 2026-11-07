<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {ModuleHeroSettingsMenu, type ModuleHeroMenuItem} from '@/core/components'

const props = defineProps<{
  layoutEditMode: boolean
}>()

const emit = defineEmits<{
  'toggle-layout-edit': []
  customize: []
  'ai-widget': []
  shares: []
}>()

const {t} = useI18n()

const items = computed<ModuleHeroMenuItem[]>(() => [
  {
    id: 'customize',
    label: t('dashboard.settingsMenu.customize'),
    icon: 'settings-layout',
  },
  {
    id: 'toggle-layout-edit',
    label: props.layoutEditMode
        ? t('dashboard.settingsMenu.layoutEditDone')
        : t('dashboard.settingsMenu.layoutEdit'),
    icon: 'settings-basic',
  },
  {
    id: 'ai-widget',
    label: t('dashboard.settingsMenu.aiWidget'),
    icon: 'settings-ai',
    dividerBefore: true,
  },
  {
    id: 'shares',
    label: t('dashboard.settingsMenu.shares'),
    icon: 'link',
  },
])

function onSelect(id: string) {
  switch (id) {
    case 'customize':
      emit('customize')
      break
    case 'toggle-layout-edit':
      emit('toggle-layout-edit')
      break
    case 'ai-widget':
      emit('ai-widget')
      break
    case 'shares':
      emit('shares')
      break
  }
}
</script>

<template>
  <ModuleHeroSettingsMenu
      :ariaLabel="t('dashboard.settingsMenu.aria')"
      :items="items"
      :active="layoutEditMode"
      @select="onSelect"
  />
</template>
