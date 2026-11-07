<script setup lang="ts">
import {WorkspaceTabIcon} from '@/features/workspace/components'
import type {WorkspaceTab} from '@/core/types'
import {useI18n} from 'vue-i18n'

defineProps<{
  open: boolean
  tabs: WorkspaceTab[]
  highlightIndex: number
}>()

const {t} = useI18n()
</script>

<template>
  <Teleport to="body">
    <div
        v-if="open && tabs.length"
        class="mru-switcher"
        role="listbox"
        :aria-label="t('workspace.mruSwitcher.title')"
    >
      <div class="mru-switcher__panel">
        <header class="mru-switcher__head">
          <span>{{ t('workspace.mruSwitcher.title') }}</span>
          <span class="mru-switcher__hint">{{ t('workspace.mruSwitcher.hint') }}</span>
        </header>
        <ul class="mru-switcher__list">
          <li
              v-for="(tab, index) in tabs"
              :key="tab.id"
              role="option"
              :aria-selected="index === highlightIndex"
              class="mru-switcher__item"
              :class="{'is-active': index === highlightIndex}"
          >
            <WorkspaceTabIcon :type="tab.type" :plugin-id="tab.pluginId"/>
            <span class="mru-switcher__title">{{ tab.title }}</span>
          </li>
        </ul>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.mru-switcher {
  position: fixed;
  inset: 0;
  z-index: var(--dw-z-modal, 1200);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
  pointer-events: none;
}

.mru-switcher__panel {
  min-width: 18rem;
  max-width: min(28rem, 90vw);
  border: 1px solid var(--dw-border);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg-panel);
  box-shadow: var(--dw-shadow-float);
  overflow: hidden;
}

.mru-switcher__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--dw-space-3);
  padding: var(--dw-space-3) var(--dw-space-4);
  border-bottom: 1px solid var(--dw-border);
  font-size: var(--dw-text-sm);
  font-weight: 600;
}

.mru-switcher__hint {
  font-weight: 400;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
}

.mru-switcher__list {
  list-style: none;
  margin: 0;
  padding: var(--dw-space-2);
  max-height: min(50vh, 22rem);
  overflow: auto;
}

.mru-switcher__item {
  display: flex;
  align-items: center;
  gap: var(--dw-space-2);
  padding: var(--dw-space-2) var(--dw-space-3);
  border-radius: var(--dw-radius-sm);
}

.mru-switcher__item.is-active {
  background: color-mix(in srgb, var(--dw-primary) 14%, transparent);
}

.mru-switcher__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--dw-text-sm);
}
</style>
