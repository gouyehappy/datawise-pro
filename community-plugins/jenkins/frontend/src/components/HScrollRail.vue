<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    /** Pixels (or fraction of viewport via stepRatio) to move per click. */
    step?: number
    stepRatio?: number
    ariaLeft?: string
    ariaRight?: string
  }>(),
  { step: 0, stepRatio: 0.65, ariaLeft: 'Scroll left', ariaRight: 'Scroll right' },
)

const trackRef = ref<HTMLElement | null>(null)
const canLeft = ref(false)
const canRight = ref(false)
let ro: ResizeObserver | null = null

function update() {
  const el = trackRef.value
  if (!el) {
    canLeft.value = false
    canRight.value = false
    return
  }
  canLeft.value = el.scrollLeft > 2
  canRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
}

function stepPx() {
  const el = trackRef.value
  if (!el) return 160
  if (props.step > 0) return props.step
  return Math.max(120, Math.round(el.clientWidth * props.stepRatio))
}

function scrollByDir(dir: -1 | 1) {
  trackRef.value?.scrollBy({ left: dir * stepPx(), behavior: 'smooth' })
}

function scrollChildIntoView(selector: string) {
  const el = trackRef.value
  if (!el) return
  const child = el.querySelector<HTMLElement>(selector)
  child?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
  nextTick(update)
}

onMounted(() => {
  update()
  if (typeof ResizeObserver !== 'undefined' && trackRef.value) {
    ro = new ResizeObserver(() => update())
    ro.observe(trackRef.value)
  }
  window.addEventListener('resize', update)
})

onBeforeUnmount(() => {
  ro?.disconnect()
  ro = null
  window.removeEventListener('resize', update)
})

defineExpose({ update, scrollChildIntoView, track: trackRef })
</script>

<template>
  <div class="hrail" :class="{ 'has-left': canLeft, 'has-right': canRight }">
    <div ref="trackRef" class="hrail__track" @scroll.passive="update">
      <slot />
    </div>
    <button
      type="button"
      class="hrail__edge hrail__edge--l"
      :class="{ 'is-on': canLeft }"
      :disabled="!canLeft"
      :tabindex="canLeft ? 0 : -1"
      :aria-hidden="!canLeft"
      :aria-label="ariaLeft"
      :title="ariaLeft"
      @click="scrollByDir(-1)"
    >
      <span class="hrail__chev" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
          <path d="M10 3.5 5.5 8 10 12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
    </button>
    <button
      type="button"
      class="hrail__edge hrail__edge--r"
      :class="{ 'is-on': canRight }"
      :disabled="!canRight"
      :tabindex="canRight ? 0 : -1"
      :aria-hidden="!canRight"
      :aria-label="ariaRight"
      :title="ariaRight"
      @click="scrollByDir(1)"
    >
      <span class="hrail__chev" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
          <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
    </button>
  </div>
</template>

<style scoped>
.hrail {
  --hrail-fade: color-mix(in srgb, var(--panel, var(--bg)) 94%, var(--bg));
  position: relative;
  min-width: 0;
  width: 100%;
}
.hrail__track {
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.hrail__track::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

/* Edge controls: overlay + fade, no layout shift when toggled. */
.hrail__edge {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 30px;
  z-index: 2;
  border: 0;
  padding: 0;
  margin: 0;
  display: grid;
  place-items: center;
  color: var(--muted);
  opacity: 0;
  pointer-events: none;
  transition: opacity .16s ease, color .12s ease;
  cursor: pointer;
}
.hrail__edge.is-on {
  opacity: 1;
  pointer-events: auto;
}
.hrail__edge:disabled {
  opacity: 0;
  pointer-events: none;
}
.hrail__edge--l {
  left: 0;
  background: linear-gradient(
    to right,
    var(--hrail-fade) 0%,
    var(--hrail-fade) 42%,
    transparent 100%
  );
}
.hrail__edge--r {
  right: 0;
  background: linear-gradient(
    to left,
    var(--hrail-fade) 0%,
    var(--hrail-fade) 42%,
    transparent 100%
  );
}
.hrail__chev {
  width: 20px;
  height: 20px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  color: color-mix(in srgb, var(--fg) 78%, var(--muted));
  background: color-mix(in srgb, var(--surface, var(--panel)) 88%, var(--fg));
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--line) 75%, transparent),
    0 1px 2px color-mix(in srgb, #000 18%, transparent);
  transition: background .12s ease, color .12s ease, box-shadow .12s ease, transform .1s ease;
}
.hrail__edge:hover {
  color: var(--fg);
}
.hrail__edge:hover .hrail__chev {
  color: var(--fg);
  background: color-mix(in srgb, var(--fg) 10%, var(--surface, var(--panel)));
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--fg) 22%, var(--line)),
    0 1px 3px color-mix(in srgb, #000 22%, transparent);
}
.hrail__edge:active .hrail__chev {
  transform: scale(.94);
}

/* Soft inset so chips aren't fully buried under the edge hit area. */
.hrail.has-left .hrail__track { scroll-padding-left: 26px; }
.hrail.has-right .hrail__track { scroll-padding-right: 26px; }
</style>
