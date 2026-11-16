<script setup lang="ts">
/**
 * 结果区 AI 动作合并：「向 AI 提问」+「AI 摘要」收进一个下拉，减少工具栏占位。
 */
import {nextTick, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'
import {usePopoverEscape} from '@/core/composables/usePopoverEscape'

withDefaults(defineProps<{
  showAsk?: boolean
  showSummary?: boolean
  summaryLoading?: boolean
}>(), {
  showAsk: false,
  showSummary: false,
  summaryLoading: false,
})

const emit = defineEmits<{
  ask: []
  summary: []
}>()

const {t} = useI18n()
const open = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const menuStyle = ref<Record<string, string>>({})

usePopoverEscape(
    () => open.value,
    () => {
      open.value = false
    },
    {containRefs: () => [triggerRef.value, menuRef.value]},
)

async function placeMenu() {
  const anchor = triggerRef.value
  if (!anchor) return
  await nextTick()
  const rect = anchor.getBoundingClientRect()
  const width = 176
  const left = Math.min(
      Math.max(8, rect.right - width),
      window.innerWidth - width - 8,
  )
  menuStyle.value = {
    top: `${Math.round(rect.bottom + 6)}px`,
    left: `${Math.round(left)}px`,
    width: `${width}px`,
  }
}

async function toggle() {
  open.value = !open.value
  if (open.value) await placeMenu()
}

function run(action: 'ask' | 'summary') {
  emit(action)
  open.value = false
}

watch(open, (isOpen) => {
  if (!isOpen) return
  void placeMenu()
})
</script>

<template>
  <div v-if="showAsk || showSummary" class="query-result-ai-menu">
    <button
        ref="triggerRef"
        type="button"
        class="grid-label-btn"
        :class="{ 'is-open': open }"
        :aria-expanded="open"
        :aria-haspopup="true"
        :title="t('queryResult.aiMenu')"
        @click="toggle"
    >
      <DwIcon class="grid-glyph grid-glyph--optical" name="bot" fit :stroke-width="1.75"/>
      <span>{{ t('queryResult.aiMenu') }}</span>
    </button>
    <Teleport to="body">
      <div
          v-if="open"
          ref="menuRef"
          class="query-result-ai-menu__menu"
          role="menu"
          :style="menuStyle"
          :aria-label="t('queryResult.aiMenu')"
      >
        <button
            v-if="showAsk"
            type="button"
            class="query-result-ai-menu__item"
            role="menuitem"
            @click="run('ask')"
        >
          <DwIcon class="query-result-ai-menu__icon" name="bot" size="md" :stroke-width="1.55"/>
          <span>{{ t('queryResult.askAi') }}</span>
        </button>
        <button
            v-if="showSummary"
            type="button"
            class="query-result-ai-menu__item"
            role="menuitem"
            :disabled="summaryLoading"
            @click="run('summary')"
        >
          <DwIcon class="query-result-ai-menu__icon" name="bot" size="md" :stroke-width="1.55"/>
          <span>{{ summaryLoading ? t('queryResult.aiSummaryLoading') : t('queryResult.aiSummary') }}</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.query-result-ai-menu {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
}

.grid-label-btn.is-open {
  background: color-mix(in srgb, var(--dw-bg-muted) 70%, transparent);
  border-color: color-mix(in srgb, var(--dw-border) 88%, var(--dw-text) 12%);
}
</style>

<style>
.query-result-ai-menu__menu {
  position: fixed;
  z-index: var(--dw-z-popover, 1200);
  min-width: 168px;
  padding: 4px;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius, 6px);
  background: var(--dw-bg-elevated, var(--dw-bg));
  box-shadow: var(--dw-shadow-md, 0 8px 24px rgb(0 0 0 / 12%));
}

.query-result-ai-menu__item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 7px 10px;
  border: 0;
  border-radius: var(--dw-control-radius-sm, 4px);
  background: transparent;
  color: var(--dw-text);
  font: inherit;
  font-size: var(--dw-text-sm);
  text-align: left;
  cursor: pointer;
}

.query-result-ai-menu__item:hover:not(:disabled) {
  background: color-mix(in srgb, var(--dw-bg-muted) 80%, transparent);
}

.query-result-ai-menu__item:disabled {
  opacity: 0.55;
  cursor: default;
}

.query-result-ai-menu__icon {
  flex-shrink: 0;
  color: var(--dw-text-secondary);
}
</style>
