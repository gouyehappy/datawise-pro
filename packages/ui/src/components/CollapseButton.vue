<script setup lang="ts">
import {computed} from 'vue'
import CollapseIcon from './CollapseIcon.vue'
import IconButton from './IconButton.vue'
import {useDwI18n} from '../i18n/useDwI18n'

const props = withDefaults(
    defineProps<{
      /** 覆盖默认「收起」文案（如通知抽屉） */
      label?: string
      size?: 'sm' | 'md' | 'lg'
      disabled?: boolean
    }>(),
    {},
)

const emit = defineEmits<{
  click: []
}>()

const t = useDwI18n()
const buttonLabel = computed(() => props.label ?? t('common.collapse'))
</script>

<template>
  <IconButton
      :size="size"
      :title="buttonLabel"
      :disabled="disabled"
      @click="emit('click')"
  >
    <CollapseIcon/>
  </IconButton>
</template>
