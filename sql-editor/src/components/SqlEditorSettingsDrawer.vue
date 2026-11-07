<script setup lang="ts">
/** 编辑器内嵌设置抽屉：遮罩 + 绑定当前 tab runtime 的本地控制器 */
import {computed} from 'vue'
import SqlEditorSettingsDrawerLocal from '@sql-editor/components/SqlEditorSettingsDrawerLocal.vue'
import {resolveEditorUiTone} from '@sql-editor/utils/editor-ui-tone'
import type {SqlEditorRuntime} from '@sql-editor/types'

const props = defineProps<{
  open: boolean
  runtime: SqlEditorRuntime
  dialect?: string
  theme?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const uiTone = computed(() => resolveEditorUiTone(props.theme))

function close() {
  emit('update:open', false)
}
</script>

<template>
  <div
      v-show="open"
      class="sql-settings-layer"
      :data-tone="uiTone"
      @click.self="close"
  >
    <SqlEditorSettingsDrawerLocal
        :runtime="runtime"
        :dialect="dialect"
        :theme="theme"
        @close="close"
    />
  </div>
</template>

<style scoped>
.sql-settings-layer {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 6px;
  box-sizing: border-box;
  background: color-mix(in srgb, var(--dw-bg-panel, #fff) 18%, transparent);
  backdrop-filter: blur(1px);
}

.sql-settings-layer[data-tone='dark'] {
  background: color-mix(in srgb, #000 32%, transparent);
}
</style>
