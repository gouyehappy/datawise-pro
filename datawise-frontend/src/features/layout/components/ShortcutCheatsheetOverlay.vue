<script setup lang="ts">
import {computed, onUnmounted, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'
import {useShortcutSettingsStore} from '@/features/settings/stores/shortcut-settings-store'
import {formatBinding} from '@/core/shortcuts/shortcut.service'
import {SHORTCUT_DEFINITIONS} from '@/core/shortcuts/definitions'
import type {ShortcutCategory} from '@/core/shortcuts/types'
import {canExecuteShortcutAction} from '@/features/auth/services/feature-permission.service'

const open = defineModel<boolean>('open', {default: false})

const {t} = useI18n()
const shortcuts = useShortcutSettingsStore()

const categories: ShortcutCategory[] = ['explorer', 'workspace', 'app']

const rows = computed(() =>
    categories.map((category) => ({
        category,
        title: t(`shortcuts.categories.${category}`),
        items: SHORTCUT_DEFINITIONS.filter(
            (def) => def.category === category && canExecuteShortcutAction(def.id),
        ).map((def) => ({
            id: def.id,
            label: t(def.labelKey),
            binding: formatBinding(shortcuts.getBinding(def.id)) || t('shortcuts.unassigned'),
        })),
    })),
)

function close() {
    open.value = false
}

function onKeydown(event: KeyboardEvent) {
    if (!open.value) return
    if (event.key === 'Escape') {
        event.preventDefault()
        close()
    }
}

watch(open, (value) => {
    if (value) window.addEventListener('keydown', onKeydown, true)
    else window.removeEventListener('keydown', onKeydown, true)
})

onUnmounted(() => window.removeEventListener('keydown', onKeydown, true))
</script>

<template>
  <Teleport to="body">
    <div
        v-if="open"
        class="shortcut-cheatsheet"
        role="dialog"
        aria-modal="true"
        :aria-label="t('shortcuts.cheatsheet.title')"
        @click.self="close"
    >
      <div class="shortcut-cheatsheet__panel">
        <header class="shortcut-cheatsheet__head">
          <div>
            <h2>{{ t('shortcuts.cheatsheet.title') }}</h2>
            <p>{{ t('shortcuts.cheatsheet.hint') }}</p>
          </div>
          <button type="button" class="shortcut-cheatsheet__close" :aria-label="t('common.close')" @click="close">
            <DwIcon name="x" size="sm" :stroke-width="1.6"/>
          </button>
        </header>
        <div class="shortcut-cheatsheet__body">
          <section v-for="group in rows" :key="group.category" class="shortcut-cheatsheet__group">
            <h3>{{ group.title }}</h3>
            <ul>
              <li v-for="item in group.items" :key="item.id">
                <span class="shortcut-cheatsheet__label">{{ item.label }}</span>
                <kbd class="shortcut-cheatsheet__keys">{{ item.binding }}</kbd>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.shortcut-cheatsheet {
  position: fixed;
  inset: 0;
  z-index: var(--dw-z-modal, 1200);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--dw-space-6);
  background: color-mix(in srgb, var(--dw-bg) 35%, transparent);
  backdrop-filter: blur(2px);
}

.shortcut-cheatsheet__panel {
  width: min(52rem, 100%);
  max-height: min(80vh, 40rem);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-panel);
  box-shadow: var(--dw-shadow-float);
  overflow: hidden;
}

.shortcut-cheatsheet__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--dw-space-4);
  padding: var(--dw-space-4) var(--dw-space-5);
  border-bottom: 1px solid var(--dw-border);
}

.shortcut-cheatsheet__head h2 {
  margin: 0;
  font-size: var(--dw-text-lg);
}

.shortcut-cheatsheet__head p {
  margin: var(--dw-space-1) 0 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
}

.shortcut-cheatsheet__close {
  border: 0;
  background: transparent;
  color: var(--dw-text-secondary);
  cursor: pointer;
  padding: var(--dw-space-2);
  border-radius: var(--dw-radius-sm);
}

.shortcut-cheatsheet__close:hover {
  background: var(--dw-bg-muted);
  color: var(--dw-text);
}

.shortcut-cheatsheet__body {
  overflow: auto;
  padding: var(--dw-space-4) var(--dw-space-5) var(--dw-space-5);
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: var(--dw-space-5);
}

.shortcut-cheatsheet__group h3 {
  margin: 0 0 var(--dw-space-2);
  font-size: var(--dw-text-sm);
  color: var(--dw-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.shortcut-cheatsheet__group ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-1);
}

.shortcut-cheatsheet__group li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-space-3);
  padding: var(--dw-space-2) 0;
  border-bottom: 1px solid color-mix(in srgb, var(--dw-border) 70%, transparent);
}

.shortcut-cheatsheet__label {
  font-size: var(--dw-text-sm);
  min-width: 0;
}

.shortcut-cheatsheet__keys {
  flex-shrink: 0;
  font-family: var(--dw-font-mono, ui-monospace, monospace);
  font-size: var(--dw-text-xs);
  padding: 0.15em 0.45em;
  border-radius: var(--dw-radius-sm);
  border: 1px solid var(--dw-border);
  background: var(--dw-bg-muted);
  color: var(--dw-text);
}
</style>
