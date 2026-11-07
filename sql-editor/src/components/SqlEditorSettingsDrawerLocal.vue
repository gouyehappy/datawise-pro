<script setup lang="ts">
/**
 * 优先用宿主注入的 App 级 controller（与设置页同一持久化 / 同一 default runtime sync），
 * 避免抽屉另起一套内存 personal，被 plugin gate refresh 用空层盖掉全局 cache。
 * 无宿主时（单测 / 预览）再为本 runtime 建本地控制器。
 */
import {inject, onMounted, toRef} from 'vue'
import SqlEditorSettingsShell from '@sql-editor/components/settings/SqlEditorSettingsShell.vue'
import {
  useSqlEditorShortcutsController,
  type SqlEditorShortcutsController,
} from '@sql-editor/composables/useSqlEditorShortcutsController'
import {SQL_EDITOR_SHORTCUTS_CONTROLLER_KEY} from '@sql-editor/config/injection'
import type {SqlEditorRuntime} from '@sql-editor/types'

const props = defineProps<{
  runtime: SqlEditorRuntime
  dialect?: string
  theme?: string
}>()

const emit = defineEmits<{
  close: []
}>()

const injected = inject(SQL_EDITOR_SHORTCUTS_CONTROLLER_KEY, null)

let controller: SqlEditorShortcutsController
if (injected) {
  controller = injected
} else {
  controller = useSqlEditorShortcutsController(props.runtime, {
    dialect: toRef(props, 'dialect'),
  })
}

onMounted(() => {
  controller.reloadFromPersistence()
})
</script>

<template>
  <SqlEditorSettingsShell
      layout="drawer"
      show-close
      :theme="theme"
      :controller="controller"
      @close="emit('close')"
  />
</template>
