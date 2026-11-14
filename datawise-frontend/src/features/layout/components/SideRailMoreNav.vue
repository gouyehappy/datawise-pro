<!-- 当前工作焦点下未置顶的主导航 — 可发现性兜底 -->
<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon, sideRailDwIcon} from '@/core/icons'
import type {SideRailItemId} from '@/features/layout/constants/side-rail-nav'

export interface SideRailMoreItem {
  id: SideRailItemId
  label: string
  caption: string
}

const props = defineProps<{
  items: readonly SideRailMoreItem[]
}>()

const emit = defineEmits<{
  select: [id: SideRailItemId]
}>()

const {t} = useI18n()
const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})

const visible = computed(() => props.items.length > 0)

function close() {
  open.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (!open.value || event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  close()
}

function onPointerDownOutside(event: PointerEvent) {
  if (!open.value || event.button !== 0) return
  const target = event.target
  if (!(target instanceof Node)) return
  if (rootRef.value?.contains(target)) return
  if (panelRef.value?.contains(target)) return
  close()
}

function bindDismiss() {
  window.addEventListener('keydown', onKeydown, true)
  // bubble phase：让菜单项 pointerdown 先处理，避免 Teleport 外点误关导致 click 丢失
  window.addEventListener('pointerdown', onPointerDownOutside, false)
}

function unbindDismiss() {
  window.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('pointerdown', onPointerDownOutside, false)
}

watch(open, async (next) => {
  unbindDismiss()
  if (!next) return
  await nextTick()
  positionPanel()
  bindDismiss()
})

onBeforeUnmount(unbindDismiss)

function positionPanel() {
  const anchor = rootRef.value
  if (!anchor) return
  const rect = anchor.getBoundingClientRect()
  const gap = 8
  const width = 280
  let left = rect.right + gap
  if (left + width > window.innerWidth - 8) {
    left = Math.max(8, rect.left - width - gap)
  }
  let top = rect.top
  const estimatedHeight = 56 + props.items.length * 52
  if (top + estimatedHeight > window.innerHeight - 8) {
    top = Math.max(8, window.innerHeight - estimatedHeight - 8)
  }
  panelStyle.value = {
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    width: `${width}px`,
  }
}

function toggle() {
  open.value = !open.value
}

function onSelect(id: SideRailItemId) {
  close()
  // 下一帧再导航，避免关菜单与模块切换抢同一轮交互
  void nextTick(() => emit('select', id))
}
</script>

<template>
  <div v-if="visible" ref="rootRef" class="rail-more">
    <button
        class="tool-btn tool-btn--stack"
        :class="{active: open}"
        type="button"
        :title="t('nav.moreHint')"
        :aria-label="t('nav.more')"
        :aria-expanded="open"
        :aria-haspopup="true"
        @click="toggle"
    >
      <span class="tool-btn__graphic">
        <DwIcon name="ellipsis" size="rail" :stroke-width="1.7"/>
      </span>
      <span class="tool-btn__caption">{{ t('nav.caption.more') }}</span>
    </button>

    <Teleport to="body">
      <Transition name="rail-more-drop">
        <div
            v-if="open"
            ref="panelRef"
            class="rail-more__panel"
            :style="panelStyle"
            role="menu"
            :aria-label="t('nav.more')"
            @pointerdown.stop
        >
          <header class="rail-more__head">
            <p class="rail-more__title">{{ t('nav.moreTitle') }}</p>
            <p class="rail-more__subtitle">{{ t('nav.moreSubtitle') }}</p>
          </header>

          <div class="rail-more__list">
            <button
                v-for="item in items"
                :key="item.id"
                type="button"
                class="rail-more__item"
                role="menuitem"
                @click="onSelect(item.id)"
            >
              <span class="rail-more__icon" aria-hidden="true">
                <DwIcon :name="sideRailDwIcon(item.id)" size="sm" :stroke-width="1.7"/>
              </span>
              <span class="rail-more__copy">
                <span class="rail-more__label">{{ item.label }}</span>
                <span class="rail-more__desc">{{ item.caption }}</span>
              </span>
              <DwIcon
                  class="rail-more__chevron"
                  name="chevron-right"
                  size="xs"
                  :stroke-width="1.8"
                  aria-hidden="true"
              />
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.rail-more {
  width: 100%;
}

.rail-more__panel {
  position: fixed;
  z-index: var(--dw-z-popover, 1200);
  display: flex;
  flex-direction: column;
  padding: var(--dw-space-2);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg-panel);
  box-shadow: var(--dw-shadow-lg, 0 12px 32px color-mix(in srgb, #000 28%, transparent));
}

.rail-more__head {
  padding: var(--dw-space-2) var(--dw-space-3) var(--dw-space-3);
  border-bottom: 1px solid color-mix(in srgb, var(--dw-border-light) 80%, transparent);
  margin-bottom: var(--dw-space-1);
}

.rail-more__title {
  margin: 0;
  font-size: var(--dw-text-sm);
  font-weight: 650;
  color: var(--dw-text);
}

.rail-more__subtitle {
  margin: var(--dw-space-1) 0 0;
  font-size: var(--dw-text-xs);
  line-height: 1.45;
  color: var(--dw-text-muted);
}

.rail-more__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rail-more__item {
  display: grid;
  grid-template-columns: 32px 1fr auto;
  align-items: center;
  gap: var(--dw-space-2);
  width: 100%;
  padding: var(--dw-space-2) var(--dw-space-3);
  border: 1px solid transparent;
  border-radius: var(--dw-control-radius-sm);
  background: transparent;
  color: var(--dw-text);
  text-align: left;
  cursor: pointer;
}

.rail-more__item:hover {
  background: color-mix(in srgb, var(--dw-text) 6%, transparent);
}

.rail-more__item:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--dw-primary) 40%, transparent);
  background: color-mix(in srgb, var(--dw-primary) 8%, transparent);
}

.rail-more__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--dw-control-radius-sm);
  color: var(--dw-text-secondary);
  background: color-mix(in srgb, var(--dw-text) 5%, transparent);
}

.rail-more__item:hover .rail-more__icon {
  color: var(--dw-primary);
  background: color-mix(in srgb, var(--dw-primary) 12%, transparent);
}

.rail-more__copy {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.rail-more__label {
  font-size: var(--dw-text-sm);
  font-weight: 600;
  line-height: 1.3;
}

.rail-more__desc {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rail-more__chevron {
  color: var(--dw-text-muted);
  opacity: 0.7;
}

.rail-more-drop-enter-active,
.rail-more-drop-leave-active {
  transition:
      opacity var(--dw-duration-fast, 0.15s) var(--dw-ease, ease),
      transform var(--dw-duration-fast, 0.15s) var(--dw-ease, ease);
}

.rail-more-drop-enter-from,
.rail-more-drop-leave-to {
  opacity: 0;
  transform: translateX(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .rail-more-drop-enter-active,
  .rail-more-drop-leave-active {
    transition: none;
  }
}
</style>
