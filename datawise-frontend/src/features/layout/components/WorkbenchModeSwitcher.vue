<!-- 工作焦点：精简侧栏情境，不是第四排主导航 -->
<script setup lang="ts">
import {computed, nextTick, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'
import {usePopoverEscape} from '@/core/composables/usePopoverEscape'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {usePendingProductionApprovalsBadge} from '@/features/team/composables/usePendingProductionApprovalsBadge'
import {useTeamStore} from '@/features/team/stores/team-store'
import {
  WORKBENCH_MODES,
  type WorkbenchMode,
} from '@/shared/config/workbench-mode'

const {t} = useI18n()
const layout = useLayoutStore()
const appConfig = useAppConfigStore()
const {pendingCount: pendingApprovalCount} = usePendingProductionApprovalsBadge()

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})

const currentMode = computed(() => appConfig.workbenchMode)
const currentDef = computed(
    () => WORKBENCH_MODES.find((item) => item.id === currentMode.value) ?? WORKBENCH_MODES[0],
)
const currentLabel = computed(() => t(currentDef.value.labelKey))
const triggerTitle = computed(() => {
  if (currentMode.value === 'govern' && pendingApprovalCount.value > 0) {
    return t('nav.mode.governPendingHint', {count: pendingApprovalCount.value})
  }
  return t('nav.mode.switcherHint', {mode: currentLabel.value})
})

const modeItems = computed(() =>
    WORKBENCH_MODES.map((item) => ({
      ...item,
      label: t(item.labelKey),
      hint: t(item.hintKey),
      active: item.id === currentMode.value,
      badge: item.id === 'govern' ? pendingApprovalCount.value : 0,
    })),
)

usePopoverEscape(open, () => {
  open.value = false
}, {
  containRefs: () => [rootRef.value, panelRef.value],
})

watch(open, async (next) => {
  if (!next) return
  await nextTick()
  positionPanel()
})

function positionPanel() {
  const anchor = rootRef.value
  if (!anchor) return
  const rect = anchor.getBoundingClientRect()
  const gap = 8
  const width = 260
  let left = rect.right + gap
  if (left + width > window.innerWidth - 8) {
    left = Math.max(8, rect.left - width - gap)
  }
  let top = rect.top
  const estimatedHeight = 280
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

function onSelectMode(mode: WorkbenchMode) {
  open.value = false
  if (mode === currentMode.value) return
  layout.setWorkbenchMode(mode)
  if (mode === 'govern' && pendingApprovalCount.value > 0) {
    useTeamStore().requestTeamTab('audit')
  }
}
</script>

<template>
  <div ref="rootRef" class="mode-switcher">
    <button
        class="tool-btn tool-btn--stack mode-switcher__trigger"
        :class="{active: open}"
        type="button"
        :title="triggerTitle"
        :aria-label="t('nav.mode.switcherAria', {mode: currentLabel})"
        :aria-expanded="open"
        :aria-haspopup="true"
        @click="toggle"
    >
      <span class="tool-btn__graphic">
        <DwIcon :name="currentDef.icon" size="rail" :stroke-width="1.7"/>
        <span
            v-if="pendingApprovalCount"
            class="tool-btn__badge"
            :title="t('nav.mode.governPendingHint', {count: pendingApprovalCount})"
        >
          {{ pendingApprovalCount > 99 ? '99+' : pendingApprovalCount }}
        </span>
      </span>
      <span class="tool-btn__caption">{{ currentLabel }}</span>
    </button>

    <Teleport to="body">
      <Transition name="mode-switcher-drop">
        <div
            v-if="open"
            ref="panelRef"
            class="mode-switcher__panel"
            :style="panelStyle"
            role="menu"
            :aria-label="t('nav.mode.menuTitle')"
        >
          <header class="mode-switcher__head">
            <p class="mode-switcher__title">{{ t('nav.mode.menuTitle') }}</p>
            <p class="mode-switcher__blurb">{{ t('nav.mode.menuBlurb') }}</p>
          </header>
          <button
              v-for="item in modeItems"
              :key="item.id"
              type="button"
              class="mode-switcher__item"
              :class="{'is-active': item.active}"
              role="menuitemradio"
              :aria-checked="item.active"
              @click="onSelectMode(item.id)"
          >
            <span class="mode-switcher__icon" aria-hidden="true">
              <DwIcon :name="item.icon" size="sm" :stroke-width="1.7"/>
            </span>
            <span class="mode-switcher__copy">
              <span class="mode-switcher__name">
                {{ item.label }}
                <span v-if="item.badge" class="mode-switcher__item-badge">
                  {{ item.badge > 99 ? '99+' : item.badge }}
                </span>
              </span>
              <span class="mode-switcher__hint">{{ item.hint }}</span>
            </span>
            <DwIcon
                v-if="item.active"
                class="mode-switcher__check"
                name="check"
                size="sm"
                :stroke-width="2"
            />
          </button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.mode-switcher {
  width: 100%;
}

.mode-switcher__trigger {
  width: 100%;
}

.mode-switcher__panel {
  position: fixed;
  z-index: var(--dw-z-popover, 1200);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--dw-space-2);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg-panel);
  box-shadow: var(--dw-shadow-lg, 0 12px 32px color-mix(in srgb, #000 28%, transparent));
}

.mode-switcher__head {
  padding: var(--dw-space-2) var(--dw-space-3) var(--dw-space-3);
}

.mode-switcher__title {
  margin: 0;
  font-size: var(--dw-text-sm);
  font-weight: 650;
  color: var(--dw-text);
}

.mode-switcher__blurb {
  margin: var(--dw-space-1) 0 0;
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
  color: var(--dw-text-muted);
}

.mode-switcher__item {
  display: grid;
  grid-template-columns: 28px 1fr auto;
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

.mode-switcher__item:hover {
  background: color-mix(in srgb, var(--dw-text) 6%, transparent);
}

.mode-switcher__item.is-active {
  border-color: color-mix(in srgb, var(--dw-primary) 28%, transparent);
  background: color-mix(in srgb, var(--dw-primary) 10%, transparent);
}

.mode-switcher__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--dw-text-secondary);
}

.mode-switcher__item.is-active .mode-switcher__icon {
  color: var(--dw-primary);
}

.mode-switcher__copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.mode-switcher__name {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-space-2);
  font-size: var(--dw-text-sm);
  font-weight: 600;
}

.mode-switcher__hint {
  font-size: var(--dw-text-xs);
  color: var(--dw-text-muted);
}

.mode-switcher__item-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: var(--dw-radius-pill);
  font-size: 10px;
  font-weight: 700;
  color: var(--dw-danger-fg, #fff);
  background: var(--dw-danger);
}

.mode-switcher__check {
  color: var(--dw-primary);
}

.mode-switcher-drop-enter-active,
.mode-switcher-drop-leave-active {
  transition:
      opacity var(--dw-duration-fast, 0.15s) var(--dw-ease, ease),
      transform var(--dw-duration-fast, 0.15s) var(--dw-ease, ease);
}

.mode-switcher-drop-enter-from,
.mode-switcher-drop-leave-to {
  opacity: 0;
  transform: translateX(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .mode-switcher-drop-enter-active,
  .mode-switcher-drop-leave-active {
    transition: none;
  }
}
</style>
