<script setup lang="ts">
/**
 * @deprecated Prefer `DwOverlayScroll` (Monaco-style painted overlay rails).
 * Compatibility alias: same behavior as `DwOverlayScroll`.
 */
import {computed, ref} from 'vue'
import DwOverlayScroll from './DwOverlayScroll.vue'

const props = withDefaults(
  defineProps<{
    hideAfterMs?: number
    /** Legacy API, ignored */
    tag?: string
  }>(),
  {
    hideAfterMs: 900,
    tag: 'div',
  },
)

const emit = defineEmits<{
  scroll: [event: Event]
}>()

const overlayRef = ref<InstanceType<typeof DwOverlayScroll> | null>(null)

defineExpose({
  el: computed(() => overlayRef.value?.el ?? null),
})
</script>

<template>
  <DwOverlayScroll
    ref="overlayRef"
    :hide-after-ms="props.hideAfterMs"
    @scroll="emit('scroll', $event)"
  >
    <slot/>
  </DwOverlayScroll>
</template>
