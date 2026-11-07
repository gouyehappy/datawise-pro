<script setup lang="ts">
import {computed} from 'vue'
import type {DwIconName} from '@/core/icons/registry'
import {resolveDwIcon} from '@/core/icons/registry'
import {
    DW_ICON_SIZE_DEFAULT,
    type DwIconSize,
    isDwIconSizeToken,
} from '@/core/icons/icon-sizes'

const props = withDefaults(
    defineProps<{
      name: DwIconName
      /** 数字像素或系统尺寸令牌（xs/sm/md/lg/xl/rail/console/tab/menu） */
      size?: DwIconSize
      strokeWidth?: number
      fit?: boolean
      active?: boolean
      muted?: boolean
      danger?: boolean
      filled?: boolean
    }>(),
    {
      strokeWidth: 1.5,
      fit: false,
      active: false,
      muted: false,
      danger: false,
      filled: false,
    },
)

const iconComponent = computed(() => resolveDwIcon(props.name, {active: props.active}))

const rootClass = computed(() => ({
    'dw-icon-root': true,
    'dw-icon': true,
    'dw-icon--fit': props.fit,
    'dw-icon--muted': props.muted,
    'dw-icon--danger': props.danger,
    'dw-icon--filled': props.filled || props.name === 'stop',
    'dw-icon--run': props.name === 'run',
    'dw-icon--stop': props.name === 'stop',
    'dw-icon--explain-plan': props.name === 'explain-plan',
    [`dw-icon--size-${resolvedSizeToken.value}`]: !props.fit && resolvedSizeToken.value !== null,
}))

const resolvedSizeToken = computed(() => {
    if (props.size === undefined) return DW_ICON_SIZE_DEFAULT
    if (isDwIconSizeToken(props.size)) return props.size
    return null
})

const pixelSize = computed(() =>
    typeof props.size === 'number' ? props.size : undefined,
)
</script>

<template>
  <span :class="rootClass">
    <component
        :is="iconComponent"
        class="dw-icon__glyph"
        aria-hidden="true"
        :size="fit || pixelSize === undefined ? undefined : pixelSize"
        :stroke-width="strokeWidth"
        absolute-stroke-width
    />
  </span>
</template>
