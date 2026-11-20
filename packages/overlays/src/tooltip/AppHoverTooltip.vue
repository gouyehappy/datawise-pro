<script setup lang="ts">
/**
 * Motty-style global hover tooltip for host chrome.
 * Intercepts native `title` → `data-tooltip`, paints an inverted bubble
 * (dark UI → near-white tip; light UI → dark tip) with a center arrow.
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

type TipState = {
  text: string
  x: number
  y: number
  above: boolean
  arrowOffset: number
}

const DELAY_MS = 0
const SIDE_GAP = 10
const VIEWPORT_PAD = 8

const tip = ref<TipState | null>(null)
const bubble = ref<HTMLElement>()
let anchor: HTMLElement | null = null
let timer = 0

function hide() {
  window.clearTimeout(timer)
  timer = 0
  tip.value = null
  anchor = null
}

function resolveTarget(node: EventTarget | null): HTMLElement | null {
  const el = (node as HTMLElement | null)?.closest?.('[title], [data-tooltip]') as HTMLElement | null
  if (!el) return null
  if (el.closest('[data-no-tooltip], .dw-no-tooltip, .cell-hover-preview')) return null
  // Skip fields / embeds that use title as an accessible name, not a hover tip.
  // iframe is critical: pointer enters the child document and the host never gets a
  // reliable mouseout, so a tip on the frame would stick forever.
  if (
    el.matches(
      'input, textarea, select, [contenteditable="true"], iframe, img, object, embed, video, audio',
    )
  ) {
    return null
  }
  return el
}

function schedule(target: HTMLElement) {
  const rawTitle = target.getAttribute('title')
  if (rawTitle !== null) {
    target.setAttribute('data-tooltip', rawTitle)
    target.removeAttribute('title')
  }
  const text = target.getAttribute('data-tooltip')?.trim()
  if (!text) return
  anchor = target
  timer = window.setTimeout(() => {
    timer = 0
    if (!target.isConnected) return
    const rect = target.getBoundingClientRect()
    const above = rect.bottom + 40 > window.innerHeight && rect.top > 40
    const center = rect.left + rect.width / 2
    tip.value = {
      text,
      x: center,
      y: above ? rect.top - SIDE_GAP : rect.bottom + SIDE_GAP,
      above,
      arrowOffset: 0,
    }
    void nextTick(() => {
      const el = bubble.value
      const current = tip.value
      if (!el || !current) return
      const half = el.offsetWidth / 2
      const clamped = Math.max(
        half + VIEWPORT_PAD,
        Math.min(current.x, window.innerWidth - half - VIEWPORT_PAD),
      )
      if (clamped !== current.x) {
        tip.value = {...current, x: clamped, arrowOffset: center - clamped}
      }
    })
  }, DELAY_MS)
}

function onOver(event: MouseEvent) {
  const target = resolveTarget(event.target)
  if (target === anchor) return
  hide()
  if (target) schedule(target)
}

function onOut(event: MouseEvent) {
  if (!anchor) return
  const related = event.relatedTarget as HTMLElement | null
  if (related && anchor.contains(related)) return
  hide()
}

function onFocusIn(event: FocusEvent) {
  const target = resolveTarget(event.target)
  if (target === anchor) return
  hide()
  if (target) schedule(target)
}

function onFocusOut(event: FocusEvent) {
  if (!anchor) return
  const related = event.relatedTarget as HTMLElement | null
  if (related && anchor.contains(related)) return
  hide()
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') hide()
}

onMounted(() => {
  document.addEventListener('mouseover', onOver, true)
  document.addEventListener('mouseout', onOut, true)
  document.addEventListener('focusin', onFocusIn, true)
  document.addEventListener('focusout', onFocusOut, true)
  document.addEventListener('pointerdown', hide, true)
  document.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('scroll', hide, true)
  window.addEventListener('blur', hide)
})

onBeforeUnmount(() => {
  hide()
  document.removeEventListener('mouseover', onOver, true)
  document.removeEventListener('mouseout', onOut, true)
  document.removeEventListener('focusin', onFocusIn, true)
  document.removeEventListener('focusout', onFocusOut, true)
  document.removeEventListener('pointerdown', hide, true)
  document.removeEventListener('keydown', onKeyDown, true)
  window.removeEventListener('scroll', hide, true)
  window.removeEventListener('blur', hide)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="tip"
      ref="bubble"
      class="dw-hover-tooltip"
      :class="{ 'is-above': tip.above }"
      :style="{
        left: `${tip.x}px`,
        top: `${tip.y}px`,
        '--dw-tooltip-arrow-offset': `${tip.arrowOffset}px`,
      }"
      role="tooltip"
    >
      {{ tip.text }}
    </div>
  </Teleport>
</template>

<style>
@import '../styles/tooltip.css';
</style>
