<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'
import {DwButton} from '@/core/components'
import type {DwIconName} from '@/core/icons'
import {UserResource} from '@/features/auth/types/user-resource.types'
import {useResourceWriteGuard} from '@/features/auth/composables/useResourceWriteGuard'
import ShortcutActionIcon from '@/core/shortcuts/ShortcutActionIcon.vue'
import type {ShortcutCategory, ShortcutDefinition} from '@/core/shortcuts/types'
import {isLocalShortcutDefinition} from '@/core/shortcuts/scope'
import ShortcutKeyInput from '@/features/settings/components/ShortcutKeyInput.vue'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import SettingsSectionCard from '@/features/settings/components/SettingsSectionCard.vue'
import SettingsTipsCard from '@/features/settings/components/SettingsTipsCard.vue'
import {useShortcutSettingsStore} from '@/features/settings/stores/shortcut-settings-store'
import {canExecuteShortcutAction} from '@/features/auth/services/feature-permission.service'
import type {ShortcutActionId} from '@/core/shortcuts/types'

const {t} = useI18n()
const shortcuts = useShortcutSettingsStore()
const {readOnly, hint, denyIfReadOnly} = useResourceWriteGuard(UserResource.AppConfig)

const categories: ShortcutCategory[] = ['explorer', 'workspace', 'app']

const categoryIcon: Record<ShortcutCategory, DwIconName> = {
  explorer: 'database',
  workspace: 'terminal',
  app: 'shortcuts',
}

const categoryMeta: Record<
    ShortcutCategory,
    { hintKey: string; tone: 'primary' | 'sky' | 'violet' }
> = {
  explorer: {hintKey: 'shortcuts.categoryHints.explorer', tone: 'primary'},
  workspace: {hintKey: 'shortcuts.categoryHints.workspace', tone: 'sky'},
  app: {hintKey: 'shortcuts.categoryHints.app', tone: 'violet'},
}

function visibleDefinitions(category: ShortcutCategory) {
  return shortcuts.groupedDefinitions[category].filter((def) =>
      canExecuteShortcutAction(def.id as ShortcutActionId),
  )
}

const assignedCount = computed(() => {
  const counts: Record<ShortcutCategory, number> = {
    explorer: 0,
    workspace: 0,
    app: 0,
  }
  for (const category of categories) {
    for (const def of visibleDefinitions(category)) {
      if (shortcuts.getBinding(def.id).trim()) counts[category] += 1
    }
  }
  return counts
})

function scopeLabel(def: ShortcutDefinition): string | null {
  return isLocalShortcutDefinition(def) ? t('shortcuts.scopeLocal') : null
}

function resetAll() {
  if (denyIfReadOnly()) return
  shortcuts.resetAll()
}
</script>

<template>
  <!-- settings content recipe: form -->
  <SettingsPageShell
      :title="t('shortcuts.title')"
      :subtitle="t('shortcuts.subtitle')"
      :readonly="readOnly"
      :readonly-hint="hint"
  >
    <template #actions>
      <DwButton variant="secondary" size="sm" type="button" :disabled="readOnly" @click="resetAll">
        <DwIcon name="refresh" size="sm" :stroke-width="1.5"/>
        {{ t('shortcuts.resetAll') }}
      </DwButton>
    </template>

    <template #tips>
      <SettingsTipsCard
          :title="t('shortcuts.tipsTitle')"
          :content="t('shortcuts.tipsContent')"
          icon="shortcuts"
      />
    </template>

    <div class="settings-groups">
      <SettingsSectionCard
          v-for="category in categories"
          v-show="visibleDefinitions(category).length > 0"
          :key="category"
          :title="t(`shortcuts.categories.${category}`)"
          :hint="t(categoryMeta[category].hintKey)"
          :icon="categoryIcon[category]"
          :tone="categoryMeta[category].tone"
          :badge="`${assignedCount[category]}/${visibleDefinitions(category).length}`"
      >
        <div v-if="visibleDefinitions(category).length" class="shortcut-table">
          <div class="shortcut-table__header">
            <span>{{ t('shortcuts.columnAction') }}</span>
            <span>{{ t('shortcuts.columnBinding') }}</span>
          </div>
          <div
              v-for="def in visibleDefinitions(category)"
              :key="def.id"
              class="shortcut-row"
          >
            <div class="shortcut-row__action">
              <span class="shortcut-row__icon">
                <ShortcutActionIcon :action-id="def.id" :size="15"/>
              </span>
              <span class="shortcut-row__label">{{ t(def.labelKey) }}</span>
              <span v-if="scopeLabel(def)" class="shortcut-row__scope">{{ scopeLabel(def) }}</span>
            </div>
            <ShortcutKeyInput :action-id="def.id"/>
          </div>
        </div>
      </SettingsSectionCard>
    </div>
  </SettingsPageShell>
</template>

<style scoped>
.shortcut-table__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--dw-space-8);
  padding: 0 var(--dw-space-6) clamp(6px, 0.8vmin, 8px);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.shortcut-table__header span:last-child {
  text-align: right;
  min-width: 188px;
}

.shortcut-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--dw-space-8);
  align-items: center;
  padding: var(--dw-pad-control-lg);
  border-radius: var(--dw-panel-radius);
  transition: background var(--dw-duration-fast) var(--dw-ease);
}

.shortcut-row:hover {
  background: var(--dw-bg-hover);
}

.shortcut-row + .shortcut-row {
  margin-top: var(--dw-space-1);
}

.shortcut-row__action {
  display: flex;
  align-items: center;
  gap: var(--dw-gap-md);
  min-width: 0;
  flex-wrap: wrap;
}

.shortcut-row__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: var(--dw-control-h);
  height: var(--dw-control-h);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg-muted);
  color: var(--dw-text-secondary);
}

.shortcut-row:hover .shortcut-row__icon {
  background: color-mix(in srgb, var(--dw-bg-muted) 70%, var(--dw-bg-hover));
  color: var(--dw-text);
}

.shortcut-row__label {
  font-size: var(--dw-text-md);
  font-weight: 500;
  line-height: var(--dw-leading-snug);
}

.shortcut-row__scope {
  flex-shrink: 0;
  padding: 1px var(--dw-space-2);
  border-radius: var(--dw-control-radius-sm);
  background: color-mix(in srgb, var(--dw-primary) 10%, transparent);
  color: var(--dw-primary);
  font-size: var(--dw-text-2xs);
  font-weight: 600;
  letter-spacing: 0.02em;
}

@media (max-width: 720px) {
  .shortcut-table__header {
    display: none;
  }

  .shortcut-row {
    grid-template-columns: 1fr;
    gap: var(--dw-gap-md);
  }
}
</style>
