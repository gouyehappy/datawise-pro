<script setup lang="ts">
/**
 * 设置页动作按钮行 —— 统一多个按钮的水平排列、换行与间距。
 * 仅负责布局，按钮的文案/状态/事件由调用方通过默认插槽决定。
 * 用于配置迁移、云同步、工作区目录等"一组操作按钮"场景。
 */
withDefaults(
    defineProps<{
      /** 靠右对齐（行内使用时）或靠左（块级操作区） */
      align?: 'start' | 'end'
    }>(),
    {align: 'start'},
)
</script>

<template>
  <div class="settings-actions" :class="[`settings-actions--${align}`]">
    <slot/>
  </div>
</template>

<style scoped>
.settings-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-gap);
}

.settings-actions--end {
  justify-content: flex-end;
}
</style>
