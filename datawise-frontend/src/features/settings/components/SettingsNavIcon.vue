<script setup lang="ts">
import type {SettingsSection} from '@/core/types'
import {DwIcon, settingsSectionDwIcon} from '@/core/icons'

defineProps<{
  section: SettingsSection
}>()
</script>

<template>
  <DwIcon
      class="settings-nav-icon"
      :name="settingsSectionDwIcon(section)"
      size="md"
      :stroke-width="1.6"
  />
</template>
