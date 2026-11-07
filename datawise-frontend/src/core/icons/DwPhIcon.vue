<script setup lang="ts">
/**
 * Phosphor 图标壳（MIT）— 新 UI / 框架推荐图标族。
 * 现有 DwIcon 仍走 Lucide；新功能优先用本组件（regular / fill / duotone 权重）。
 */
import {computed, type Component} from 'vue'
import {
    DW_ICON_SIZE_DEFAULT,
    type DwIconSize,
    isDwIconSizeToken,
} from '@/core/icons/icon-sizes'
import {resolveDwPhIcon, type DwPhIconName} from '@/core/icons/phosphor-registry'

export type DwPhWeight = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'

const props = withDefaults(
    defineProps<{
      name: DwPhIconName
      /** 也可直接传入 Phosphor 组件，跳过 name 解析 */
      icon?: Component
      size?: DwIconSize
      weight?: DwPhWeight
      mirrored?: boolean
      muted?: boolean
      danger?: boolean
      fit?: boolean
    }>(),
    {
      weight: 'regular',
      mirrored: false,
      muted: false,
      danger: false,
      fit: false,
    },
)

const iconComponent = computed(() => props.icon ?? resolveDwPhIcon(props.name))

const resolvedSizeToken = computed(() => {
    if (props.size === undefined) return DW_ICON_SIZE_DEFAULT
    if (isDwIconSizeToken(props.size)) return props.size
    return null
})

const pixelSize = computed(() =>
    typeof props.size === 'number' ? props.size : undefined,
)

const rootClass = computed(() => ({
    'dw-icon-root': true,
    'dw-icon': true,
    'dw-ph-icon': true,
    'dw-icon--fit': props.fit,
    'dw-icon--muted': props.muted,
    'dw-icon--danger': props.danger,
    [`dw-icon--size-${resolvedSizeToken.value}`]: !props.fit && resolvedSizeToken.value !== null,
}))
</script>

<template>
  <span :class="rootClass">
    <component
        :is="iconComponent"
        class="dw-icon__glyph"
        aria-hidden="true"
        :size="fit || pixelSize === undefined ? '1em' : pixelSize"
        :weight="weight"
        :mirrored="mirrored"
        color="currentColor"
    />
  </span>
</template>
