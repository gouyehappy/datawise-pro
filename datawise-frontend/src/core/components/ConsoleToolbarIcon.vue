<script setup lang="ts">
/**
 * Thin host wrapper — SoT `@datawise/chrome` ConsoleToolbarIcon.
 * Product console keys mapped via resolveIcon.
 */
import {ConsoleToolbarIcon as PackageConsoleToolbarIcon} from '@datawise/chrome'
import type {ConsoleToolbarIconName} from '@/core/types/console-toolbar-icon'
import type {DwIconName} from '@/core/icons'

const ICON_MAP: Record<ConsoleToolbarIconName, DwIconName> = {
  run: 'run',
  stop: 'stop',
  explainPlan: 'explain-plan',
  submit: 'submit',
  rollback: 'rollback',
  disconnect: 'disconnect',
  save: 'save',
  saveAs: 'save-as',
  bookmark: 'bookmark',
  viewModel: 'view-model',
  format: 'format',
  foldAll: 'fold-all',
  unfoldAll: 'unfold-all',
  sqlEditorSettings: 'settings-sql-editor',
  visualQuery: 'tab-schema-er',
  terminal: 'terminal',
  fullscreen: 'fullscreen',
  ai: 'ai',
}

withDefaults(
  defineProps<{
    name: ConsoleToolbarIconName
    active?: boolean
    muted?: boolean
  }>(),
  {active: false, muted: false},
)

function resolveIcon(key: string): DwIconName | undefined {
  return ICON_MAP[key as ConsoleToolbarIconName]
}
</script>

<template>
  <PackageConsoleToolbarIcon
      :name="name"
      :resolve-icon="resolveIcon"
      :active="active"
      :muted="muted"
  />
</template>
