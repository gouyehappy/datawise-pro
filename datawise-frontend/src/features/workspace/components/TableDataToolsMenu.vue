<script setup lang="ts">
/**
 * 表数据工具栏「数据工具」下拉：生成数据 / 导入数据 / 导出数据（对齐 DBX 归类）。
 */
import {nextTick, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'
import {usePopoverEscape} from '@/core/composables/usePopoverEscape'

withDefaults(defineProps<{
  showGenerate?: boolean
  showImport?: boolean
  showExport?: boolean
}>(), {
  showGenerate: true,
  showImport: true,
  showExport: true,
})

const emit = defineEmits<{
  'generate-data': []
  'import-data': []
  'export-data': []
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

function run(action: 'generate-data' | 'import-data' | 'export-data') {
  emit(action)
  open.value = false
}

watch(open, (isOpen) => {
  if (!isOpen) return
  void placeMenu()
})
</script>

<template>
  <div class="table-data-tools">
    <button
        ref="triggerRef"
        type="button"
        class="grid-label-btn"
        :class="{ 'is-open': open }"
        :aria-expanded="open"
        :aria-haspopup="true"
        :title="t('dataGrid.dataTools.title')"
        @click="toggle"
    >
      <DwIcon class="grid-glyph grid-glyph--optical" name="layers" fit :stroke-width="1.75"/>
      <span>{{ t('dataGrid.dataTools.title') }}</span>
    </button>
    <Teleport to="body">
      <div
          v-if="open"
          ref="menuRef"
          class="table-data-tools__menu"
          role="menu"
          :style="menuStyle"
          :aria-label="t('dataGrid.dataTools.title')"
      >
        <button
            v-if="showGenerate"
            type="button"
            class="table-data-tools__item"
            role="menuitem"
            @click="run('generate-data')"
        >
          <DwIcon class="table-data-tools__icon" name="dices" size="md" :stroke-width="1.55"/>
          <span>{{ t('dataGrid.dataTools.generate') }}</span>
        </button>
        <button
            v-if="showImport"
            type="button"
            class="table-data-tools__item"
            role="menuitem"
            @click="run('import-data')"
        >
          <DwIcon class="table-data-tools__icon" name="import" size="md" :stroke-width="1.55"/>
          <span>{{ t('dataGrid.dataTools.import') }}</span>
        </button>
        <button
            v-if="showExport"
            type="button"
            class="table-data-tools__item"
            role="menuitem"
            @click="run('export-data')"
        >
          <DwIcon class="table-data-tools__icon" name="export" size="md" :stroke-width="1.55"/>
          <span>{{ t('dataGrid.dataTools.export') }}</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.table-data-tools {
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
/* Teleported menu — keep unscoped, namespaced */
.table-data-tools__menu {
  position: fixed;
  z-index: var(--dw-z-popover, 1200);
  min-width: 168px;
  padding: 4px;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-control-radius, 6px);
  background: var(--dw-bg-elevated, var(--dw-bg));
  box-shadow: var(--dw-shadow-md, 0 8px 24px rgb(0 0 0 / 12%));
}

.table-data-tools__item {
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

.table-data-tools__item:hover {
  background: color-mix(in srgb, var(--dw-bg-muted) 80%, transparent);
}

.table-data-tools__icon {
  flex-shrink: 0;
  color: var(--dw-text-secondary);
}
</style>
