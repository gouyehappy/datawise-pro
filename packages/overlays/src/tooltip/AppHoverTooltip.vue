<script setup lang="ts">
/**
 * Global hover tooltip for host chrome.
 * Intercepts native `title` → `data-tooltip` and paints a theme-matched bubble.
 *
 * 观感收敛（避免「鼠标移上去就弹一大块」）：
 *  - 延迟 400ms，快速划过不弹；
 *  - 提示文本与元素自身可见文字重复时直接不弹（图标+文字按钮不再重复提示）；
 *  - hover 落在宿主内部的交互控件（开关 / 输入框 / 按钮）上时不弹，避免气泡盖住正在操作的区域。
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

type TipState = {
  text: string
  x: number
  y: number
  above: boolean
  arrowOffset: number
}

const DELAY_MS = 400
/** Leave room for the integrated caret between trigger and bubble. */
const SIDE_GAP = 12
const VIEWPORT_PAD = 8
/** 只有短标签才做「与可见文字重复」判断，长说明文字不受影响 */
const REDUNDANT_MAX_LEN = 24

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
  // 提示挂在「整行 / 整块」容器上时，鼠标停在内部的开关、分段按钮、输入框等控件上不弹：
  // 这类气泡又长又宽，会正好盖住用户正在操作的控件（设置页尤其明显）。
  const innerControl = (node as HTMLElement | null)?.closest?.(
    'input, select, textarea, button, [role="button"]',
  ) as HTMLElement | null
  // 仅拦截「宽容器」（整行设置项）：纯图标开关等自身即提示宿主的窄控件不拦截，
  // 否则它们的说明会永远弹不出来。
  if (
    innerControl &&
    innerControl !== el &&
    el.contains(innerControl) &&
    el.getBoundingClientRect().width > 160
  ) return null
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
  // 「图标 + 文字」按钮已经把标签写在脸上，再弹一个同名的气泡纯属冗余。
  if (text.length <= REDUNDANT_MAX_LEN) {
    const visible = (target.innerText || target.textContent || '').trim()
    if (visible === text || visible.includes(text)) return
  }
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
