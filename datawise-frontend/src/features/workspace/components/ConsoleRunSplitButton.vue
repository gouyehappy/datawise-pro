<script setup lang="ts">
import {ref} from 'vue'
import {useI18n} from 'vue-i18n'
import ConsoleToolbarIcon from '@/core/components/ConsoleToolbarIcon.vue'
import {DwIcon} from '@/core/icons'
import {usePopoverEscape} from '@/core/composables/usePopoverEscape'
import type {SqlExecuteMode} from '@/features/workspace/services/resolve-executable-sql'

const props = defineProps<{
  running: boolean
  disabled?: boolean
  runTitle: string
  cancelTitle: string
}>()

const emit = defineEmits<{
  run: []
  cancel: []
  'run-with-mode': [mode: Exclude<SqlExecuteMode, 'auto'>]
}>()

const {t} = useI18n()
const rootRef = ref<HTMLElement | null>(null)
const menuOpen = ref(false)

usePopoverEscape(
    () => menuOpen.value,
    () => {
      menuOpen.value = false
    },
    {containRefs: () => [rootRef.value]},
)

function onPrimaryClick() {
  menuOpen.value = false
  if (props.running) emit('cancel')
  else emit('run')
}

function toggleMenu() {
  if (props.running || props.disabled) return
  menuOpen.value = !menuOpen.value
}

function pickMode(mode: Exclude<SqlExecuteMode, 'auto'>) {
  menuOpen.value = false
  emit('run-with-mode', mode)
}
</script>

<template>
  <div
      ref="rootRef"
      class="console-run-split"
      :class="{
        'is-running': running,
        'is-disabled': disabled && !running,
        'is-menu-open': menuOpen,
      }"
  >
    <button
        type="button"
        class="console-run-btn console-run-split__btn console-run-split__primary"
        :class="{ 'is-cancel': running }"
        :disabled="disabled && !running"
        :title="running ? cancelTitle : runTitle"
        data-testid="sql-console-run"
        @click="onPrimaryClick"
    >
      <ConsoleToolbarIcon :name="running ? 'stop' : 'run'"/>
    </button>
    <button
        v-if="!running"
        type="button"
        class="console-run-split__btn console-run-split__scope"
        :disabled="disabled"
        :title="t('console.runModes.menu')"
        :aria-label="t('console.runModes.menu')"
        :aria-expanded="menuOpen"
        @click.stop="toggleMenu"
    >
      <span class="dw-console-glyph">
        <DwIcon name="list-ordered" fit :stroke-width="1.75"/>
      </span>
    </button>
    <div
        v-if="menuOpen && !running"
        class="console-run-split__menu"
        role="menu"
        :aria-label="t('console.runModes.menu')"
    >
      <button type="button" role="menuitem" @click="pickMode('selection')">
        <DwIcon name="edit" size="md" :stroke-width="1.55"/>
        <span class="console-run-split__copy">
          <span class="console-run-split__title">{{ t('console.runModes.selection') }}</span>
          <span class="console-run-split__hint">{{ t('console.runModes.selectionHint') }}</span>
        </span>
      </button>
      <button type="button" role="menuitem" @click="pickMode('statement')">
        <DwIcon name="code" size="md" :stroke-width="1.55"/>
        <span class="console-run-split__copy">
          <span class="console-run-split__title">{{ t('console.runModes.statement') }}</span>
          <span class="console-run-split__hint">{{ t('console.runModes.statementHint') }}</span>
        </span>
      </button>
      <button type="button" role="menuitem" @click="pickMode('all')">
        <DwIcon name="file" size="md" :stroke-width="1.55"/>
        <span class="console-run-split__copy">
          <span class="console-run-split__title">{{ t('console.runModes.all') }}</span>
          <span class="console-run-split__hint">{{ t('console.runModes.allHint') }}</span>
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.console-run-split {
  --run-split-h: var(--dw-console-btn-size);
  position: relative;
  display: inline-flex;
  align-items: stretch;
  height: var(--run-split-h);
  overflow: visible;
}

.console-run-split__btn {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--run-split-h);
  height: 100%;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: var(--dw-control-radius);
  background: transparent;
  color: var(--dw-text-secondary);
  cursor: pointer;
}

.console-run-split__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.console-run-split__primary {
  color: var(--dw-success);
}

.console-run-split__primary:hover:not(:disabled) {
  color: var(--dw-success);
  background: color-mix(in srgb, var(--dw-success) 12%, transparent);
}

.console-run-split__primary.is-cancel {
  color: var(--dw-danger);
}

.console-run-split__primary.is-cancel:hover:not(:disabled) {
  color: var(--dw-danger);
  background: color-mix(in srgb, var(--dw-danger) 10%, transparent);
}

.console-run-split__scope:hover:not(:disabled),
.console-run-split.is-menu-open .console-run-split__scope {
  color: var(--dw-text);
  background: color-mix(in srgb, var(--dw-text) 6%, transparent);
}

.console-run-split__menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: var(--dw-z-dropdown);
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 15.5rem;
  padding: 6px;
  border: 1px solid color-mix(in srgb, var(--dw-border) 70%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--dw-bg-panel) 92%, var(--dw-text) 8%);
  box-shadow: 0 8px 28px rgb(0 0 0 / 45%);
}

.console-run-split__menu > button {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  margin: 0;
  padding: 7px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dw-text);
  text-align: left;
  cursor: pointer;
}

.console-run-split__menu > button:hover {
  background: color-mix(in srgb, var(--dw-bg-muted) 70%, transparent);
}

.console-run-split__copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.console-run-split__title {
  font-size: var(--dw-text-sm);
  line-height: 1.3;
}

.console-run-split__hint {
  font-size: var(--dw-text-xs);
  line-height: 1.35;
  color: var(--dw-text-secondary);
}
</style>
