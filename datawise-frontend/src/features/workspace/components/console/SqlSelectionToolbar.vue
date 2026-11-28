<!--
  SQL 选中文本浮层（执行 / EXPLAIN / 格式化）。

  关键设计：本组件不参与 Vue 的渲染 / patch。
  - 模板恒为空；浮层 DOM 由 onMounted 命令式创建挂到 body，onBeforeUnmount 销毁。
  - 显隐 / 坐标只走单例 controller.apply 的纯 DOM 写入，绝不进入 Vue 组件更新队列。
  这样 executeSql 后结果面板、编辑器、错误边界的 patch 与浮层完全解耦，
  从根本上消除 insertBefore of null 的竞态。
-->
<script setup lang="ts">
import {onBeforeUnmount, onMounted} from 'vue'
import {useI18n} from 'vue-i18n'
import {
  getSqlSelectionToolbarState,
  hideSqlSelectionToolbar,
  registerToolbarController,
  runSqlSelectionToolbarAction,
  unregisterToolbarController,
  type SqlSelectionToolbarController,
  type SqlSelectionToolbarViewState,
} from '@/features/workspace/services/sql-selection-toolbar.singleton'

defineOptions({name: 'SqlSelectionToolbar'})

const {t} = useI18n()

const ESTIMATED_WIDTH = 280
const ESTIMATED_HEIGHT = 36
const MARGIN = 8
function clamp(value: number, max: number) {
  return Math.min(Math.max(value, MARGIN), Math.max(MARGIN, max))
}

const RUN_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.2 2.8v10.4c0 .55.6.88 1.08.6l7.8-4.55c.48-.28.48-.97 0-1.25L5.28 3.2c-.48-.27-1.08.06-1.08.6z"/></svg>'
const EXPLAIN_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3.5h10M3 8h6.5M3 12.5h4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>'
const FORMAT_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.5h11M2.5 7h7M2.5 10.5h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>'

interface ToolbarDom {
  root: HTMLDivElement
  runBtn: HTMLButtonElement
  explainBtn: HTMLButtonElement
  formatBtn: HTMLButtonElement
}
let dom: ToolbarDom | null = null

function makeButton(extraClass: string, icon: string, label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = `dw-sql-selection-toolbar__btn${extraClass ? ` ${extraClass}` : ''}`
  btn.innerHTML = icon
  const span = document.createElement('span')
  span.textContent = label
  btn.appendChild(span)
  btn.addEventListener('click', onClick)
  return btn
}

function buildDom(): ToolbarDom {
  const root = document.createElement('div')
  root.className = 'dw-sql-selection-toolbar'
  root.setAttribute('role', 'toolbar')
  root.style.display = 'none'
  // 阻止 mousedown 抢走编辑器焦点，否则选区被清空。
  root.addEventListener('mousedown', (event) => event.preventDefault())
  root.addEventListener('contextmenu', (event) => event.preventDefault())

  const runBtn = makeButton('dw-sql-selection-toolbar__btn--run', RUN_ICON, '', () => {
    runSqlSelectionToolbarAction('run')
  })
  const explainBtn = makeButton('', EXPLAIN_ICON, 'EXPLAIN', () => {
    if (!explainBtn.classList.contains('is-disabled')) {
      runSqlSelectionToolbarAction('explain')
    }
  })
  const formatBtn = makeButton('', FORMAT_ICON, '', () => {
    runSqlSelectionToolbarAction('format')
  })
  const sep = document.createElement('span')
  sep.className = 'dw-sql-selection-toolbar__sep'
  sep.setAttribute('aria-hidden', 'true')

  root.append(runBtn, explainBtn, sep, formatBtn)
  document.body.appendChild(root)
  return {root, runBtn, explainBtn, formatBtn}
}

const controller: SqlSelectionToolbarController = {
  apply(state: SqlSelectionToolbarViewState) {
    if (!dom) return
    dom.root.style.display = state.visible ? 'flex' : 'none'
    if (!state.visible) return
    dom.root.style.left = `${clamp(state.x, window.innerWidth - ESTIMATED_WIDTH - MARGIN)}px`
    dom.root.style.top = `${clamp(state.y, window.innerHeight - ESTIMATED_HEIGHT - MARGIN)}px`

    const runLabel = t('console.editorMenu.runSelection')
    dom.runBtn.title = runLabel
    const runText = dom.runBtn.querySelector('span')
    if (runText) runText.textContent = runLabel

    dom.explainBtn.title = t('console.editorMenu.explainPlan')
    dom.explainBtn.classList.toggle('is-disabled', !state.explainSupported)
    dom.explainBtn.setAttribute('aria-disabled', String(!state.explainSupported))

    const formatLabel = t('console.editorMenu.format')
    dom.formatBtn.title = formatLabel
    const formatText = dom.formatBtn.querySelector('span')
    if (formatText) formatText.textContent = formatLabel
  },
}

function onViewportChange() {
  if (getSqlSelectionToolbarState().visible) hideSqlSelectionToolbar()
}

onMounted(() => {
  dom = buildDom()
  registerToolbarController(controller)
  window.addEventListener('scroll', onViewportChange, true)
  window.addEventListener('resize', onViewportChange)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onViewportChange, true)
  window.removeEventListener('resize', onViewportChange)
  unregisterToolbarController(controller)
  dom?.root.remove()
  dom = null
})
</script>

<template>
  <!-- 渲染恒为空：浮层 DOM 完全由上面的命令式代码管理，不进入 Vue patch。 -->
</template>

<style>
.dw-sql-selection-toolbar {
  position: fixed;
  z-index: var(--dw-z-dropdown, 120);
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border: 1px solid var(--dw-border, #374151);
  border-radius: var(--dw-surface-radius, 8px);
  background: var(--dw-surface-raised, #1f2937);
  box-shadow: 0 6px 20px rgb(0 0 0 / 28%);
  user-select: none;
  white-space: nowrap;
}

.dw-sql-selection-toolbar__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
  padding: 0 9px;
  border: 0;
  border-radius: var(--dw-surface-radius, 5px);
  background: transparent;
  color: var(--dw-text-secondary, #cbd5e1);
  font-size: var(--dw-font-size-menu, 12px);
  line-height: 1;
  cursor: pointer;
}

.dw-sql-selection-toolbar__btn:hover {
  background: color-mix(in srgb, var(--dw-text) 9%, transparent);
  color: var(--dw-text, #e5e7eb);
}

.dw-sql-selection-toolbar__btn:focus-visible {
  outline: 2px solid var(--dw-primary, #3b82f6);
  outline-offset: -2px;
}

.dw-sql-selection-toolbar__btn svg {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  fill: currentColor;
}

.dw-sql-selection-toolbar__btn--run {
  color: #22c55e;
}

.dw-sql-selection-toolbar__btn--run:hover {
  color: #16a34a;
}

.dw-sql-selection-toolbar__btn.is-disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.dw-sql-selection-toolbar__btn.is-disabled:hover {
  background: transparent;
  color: var(--dw-text-secondary, #cbd5e1);
}

.dw-sql-selection-toolbar__sep {
  width: 1px;
  height: 16px;
  margin: 0 2px;
  background: color-mix(in srgb, var(--dw-text) 14%, transparent);
}
</style>
