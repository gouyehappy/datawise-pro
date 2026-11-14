<script setup lang="ts">
import {computed} from 'vue'
import {DwIcon, type DwIconName} from '@datawise/icons'

/**
 * Neutral console toolbar glyph.
 * Prefer `name` (DwIconName) or the `icon` / default slot — no product icon maps.
 * Hosts may pass `resolveIcon` to map legacy console keys → DwIconName.
 */
const props = withDefaults(
  defineProps<{
    /** Direct DwIcon registry name */
    name?: DwIconName | string
    /** Optional host resolver for legacy product console keys */
    resolveIcon?: (name: string) => DwIconName | string | undefined
    active?: boolean
    muted?: boolean
  }>(),
  {
    active: false,
    muted: false,
  },
)

const dwName = computed(() => {
  if (!props.name) return undefined
  const resolved = props.resolveIcon?.(props.name) ?? props.name
  return resolved as DwIconName
})
</script>

<template>
  <span
    class="dw-console-glyph"
    :class="{ 'dw-console-glyph--muted': muted }"
    :data-console-icon="name || dwName || undefined"
  >
    <slot name="icon">
      <slot>
        <DwIcon
          v-if="dwName"
          :name="dwName"
          :active="active"
          :muted="muted"
          :stroke-width="2"
          fit
        />
      </slot>
    </slot>
  </span>
</template>
