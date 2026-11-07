<script setup lang="ts">
/** HOST_ONLY — connection brand icons / tints; never ship in `@datawise/*`. */
import {computed} from 'vue'
import {
    resolveDbBrandIcon,
    resolveDbBrandIconColor,
} from '@/shared/connection/db-brand-icon'
import {dbIconTint} from '@/shared/connection/db-icon-tints'
import {DB_TYPE_ICON_SIZE} from '@/shared/connection/db-type-icon-sizes'
import {useDocumentThemeIsDark} from '@/shared/config/use-document-theme'
import type {DbType} from '@/core/types'

const props = withDefaults(
    defineProps<{ dbType: string; size?: number; framed?: boolean }>(),
    {framed: true},
)

const isDark = useDocumentThemeIsDark()
const icon = computed(() => resolveDbBrandIcon(props.dbType))
const fill = computed(() => resolveDbBrandIconColor(props.dbType, isDark.value))

const boxSize = computed(() => Math.round(props.size ?? DB_TYPE_ICON_SIZE.list))
const glyphSize = computed(() =>
    props.framed
        ? Math.max(12, Math.round(boxSize.value * 0.75))
        : boxSize.value,
)
const frameRadius = computed(() =>
    boxSize.value >= 44
        ? 'var(--dw-radius-xl)'
        : boxSize.value >= 32
            ? 'var(--dw-radius-lg)'
            : 'var(--dw-control-radius-sm)',
)
const tint = computed(() => dbIconTint(props.dbType as DbType, isDark.value))

const pathTransform = computed(
    () => `translate(12 12) scale(${icon.value.scale}) translate(${-icon.value.cx} ${-icon.value.cy})`,
)

/** 字母徽标：按字符数缩小字号，保证 1–3 字符都放得下 */
const labelFontSize = computed(() => {
    const len = icon.value.label?.length ?? 1
    return len >= 3 ? 9 : len === 2 ? 11.5 : 15
})
</script>

<template>
  <span
      class="db-icon"
      :class="{ 'db-icon--framed': framed }"
      :style="framed
        ? {
            width: `${boxSize}px`,
            height: `${boxSize}px`,
            borderRadius: frameRadius,
            background: tint,
          }
        : {
            width: `${glyphSize}px`,
            height: `${glyphSize}px`,
          }"
      :title="icon.title"
      aria-hidden="true"
  >
    <svg
        viewBox="0 0 24 24"
        :width="glyphSize"
        :height="glyphSize"
        role="img"
        shape-rendering="geometricPrecision"
    >
      <text
          v-if="icon.label"
          x="12"
          y="12"
          text-anchor="middle"
          dominant-baseline="central"
          :font-size="labelFontSize"
          font-weight="700"
          font-family="'Segoe UI', 'PingFang SC', system-ui, sans-serif"
          :fill="fill"
      >{{ icon.label }}</text>
      <g v-else :transform="pathTransform">
        <template v-if="icon.layers?.length">
          <path
              v-for="(layer, index) in icon.layers"
              :key="index"
              :d="layer.path"
              :fill="layer.fill"
          />
        </template>
        <path v-else :d="icon.path" :fill="fill"/>
      </g>
    </svg>
  </span>
</template>

<style scoped>
.db-icon {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  line-height: 0;
}

.db-icon svg {
  display: block;
}

.db-icon--framed {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dw-text) 6%, transparent);
}
</style>
