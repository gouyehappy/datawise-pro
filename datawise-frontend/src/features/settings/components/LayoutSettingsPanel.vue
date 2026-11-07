<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'
import {DwButton} from '@/core/components'
import LayoutToggleChip from '@/features/settings/components/LayoutToggleChip.vue'
import LayoutWorkbenchPreview from '@/features/settings/components/LayoutWorkbenchPreview.vue'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import SettingsSectionCard from '@/features/settings/components/SettingsSectionCard.vue'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {useResourceWriteGuard} from '@/features/auth/composables/useResourceWriteGuard'
import {UserResource} from '@/features/auth/types/user-resource.types'

const {t} = useI18n()
const appConfig = useAppConfigStore()
const layout = useLayoutStore()
const explorer = useExplorerStore()
const toast = useAppToast()
const {readOnly: guestReadOnly, hint: guestReadOnlyHint, denyIfReadOnly} = useResourceWriteGuard(UserResource.LayoutMenu)
const fileInputRef = ref<HTMLInputElement>()

const leftMainItems = computed(() =>
    appConfig.sideRailItems.filter((item) => item.section === 'main'),
)
const leftUtilItems = computed(() =>
    appConfig.sideRailItems.filter((item) => item.section === 'util'),
)
const leftBottomItems = computed(() =>
    appConfig.sideRailItems.filter((item) => item.section === 'bottom'),
)

const leftVisibleCount = computed(
    () => appConfig.sideRailItems.filter((item) => item.visible).length,
)
const rightVisibleCount = computed(
    () => appConfig.shortcutRailItems.filter((item) => item.visible).length,
)

function onResetDockPlacement() {
  if (denyIfReadOnly()) return
  appConfig.resetDockPlacement()
  toast.success(t('settings.layout.resetDockPlacementSuccess'))
}

function onExport() {
  if (denyIfReadOnly()) return
  appConfig.exportConfig()
  toast.success(t('settings.layout.exportSuccess'))
}

function onImportClick() {
  fileInputRef.value?.click()
}

async function onFileChange(event: Event) {
  if (denyIfReadOnly()) return
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  try {
    const text = await file.text()
    const ok = appConfig.importConfigText(text)
    if (ok) toast.success(t('settings.layout.importSuccess'))
    else toast.error(t('settings.layout.importFailed'))
  } catch {
    toast.error(t('settings.layout.importFailed'))
  }
}
</script>

<template>
  <!-- settings content recipe: cards -->
  <SettingsPageShell
      :title="t('settings.layout.title')"
      :subtitle="t('settings.layout.subtitle')"
      :readonly="guestReadOnly"
      :readonly-hint="guestReadOnlyHint"
  >
    <div class="settings-groups">
      <section class="preview-section">
        <LayoutWorkbenchPreview/>
      </section>

      <div class="settings-grid">
        <SettingsSectionCard
            :title="t('settings.layout.leftRail')"
            :hint="t('settings.layout.leftRailHint')"
            icon="layout"
            tone="sky"
            :badge="`${leftVisibleCount}/${appConfig.sideRailItems.length}`"
        >
          <div class="toggle-group">
            <span class="toggle-group__label">{{ t('settings.layout.groupMain') }}</span>
            <div class="toggle-grid">
              <LayoutToggleChip
                  v-for="item in leftMainItems"
                  :key="item.id"
                  :label="t(item.labelKey)"
                  :caption="t(item.captionKey)"
                  :active="item.visible"
                  @toggle="appConfig.setSideRailVisible(item.id, !item.visible)"
              />
            </div>
          </div>

          <div class="toggle-group">
            <span class="toggle-group__label">{{ t('settings.layout.groupUtil') }}</span>
            <div class="toggle-grid">
              <LayoutToggleChip
                  v-for="item in leftUtilItems"
                  :key="item.id"
                  :label="t(item.labelKey)"
                  :caption="t(item.captionKey)"
                  :active="item.visible"
                  @toggle="appConfig.setSideRailVisible(item.id, !item.visible)"
              />
            </div>
          </div>

          <div v-if="leftBottomItems.length" class="toggle-group">
            <span class="toggle-group__label">{{ t('settings.layout.groupBottom') }}</span>
            <div class="toggle-grid">
              <LayoutToggleChip
                  v-for="item in leftBottomItems"
                  :key="item.id"
                  :label="t(item.labelKey)"
                  :caption="t(item.captionKey)"
                  :active="item.visible"
                  @toggle="appConfig.setSideRailVisible(item.id, !item.visible)"
              />
            </div>
          </div>
        </SettingsSectionCard>

        <SettingsSectionCard
            :title="t('settings.layout.rightRail')"
            :hint="t('settings.layout.rightRailHint')"
            icon="tree"
            tone="violet"
            :badge="`${rightVisibleCount}/${appConfig.shortcutRailItems.length}`"
        >
          <div class="toggle-grid">
            <LayoutToggleChip
                v-for="item in appConfig.shortcutRailItems"
                :key="item.id"
                :label="t(item.labelKey)"
                :caption="t(item.captionKey)"
                :active="item.visible"
                @toggle="appConfig.setShortcutVisible(item.id, !item.visible)"
            />
          </div>
        </SettingsSectionCard>
      </div>

      <SettingsSectionCard
          id="settings-layout-explorer-display"
          :title="t('settings.layout.panels')"
          :hint="t('settings.layout.panelsHint')"
          icon="open"
          tone="panel"
          compact-head
      >
        <LayoutToggleChip
            class="panel-explorer-toggle"
            :label="t('settings.layout.showExplorer')"
            :caption="t('settings.layout.showExplorerHint')"
            :active="appConfig.showExplorerPanel"
            @toggle="appConfig.setShowExplorerPanel(!appConfig.showExplorerPanel)"
        />
        <div class="panel-reset-row">
          <DwButton variant="secondary" type="button" @click="onResetDockPlacement">
            {{ t('settings.layout.resetDockPlacement') }}
          </DwButton>
          <p class="hint panel-reset-row__hint">{{ t('settings.layout.resetDockPlacementHint') }}</p>
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard
          :title="t('settings.layout.explorerDisplay')"
          :hint="t('settings.layout.explorerDisplayHint')"
          icon="tree"
          tone="sky"
      >
        <div class="toggle-grid">
          <LayoutToggleChip
              :label="t('explorer.showColumnComment')"
              :caption="t('settings.layout.explorerAlsoInToolbar')"
              :active="explorer.showColumnComment"
              @toggle="explorer.showColumnComment = !explorer.showColumnComment"
          />
          <LayoutToggleChip
              :label="t('explorer.showTableComment')"
              :caption="t('settings.layout.explorerAlsoInToolbar')"
              :active="explorer.showTableComment"
              @toggle="explorer.showTableComment = !explorer.showTableComment"
          />
          <LayoutToggleChip
              :label="t('explorer.showSemanticLayer')"
              :caption="t('settings.layout.explorerAlsoInToolbar')"
              :active="explorer.showSemanticLayer"
              @toggle="explorer.showSemanticLayer = !explorer.showSemanticLayer"
          />
        </div>
      </SettingsSectionCard>

      <section class="config-card">
        <div class="config-card__icon" aria-hidden="true">
          <DwIcon name="file" size="xl" :stroke-width="1.6"/>
        </div>
        <div class="config-card__body">
          <h3>{{ t('settings.layout.configFile') }}</h3>
          <p class="hint">{{ t('settings.layout.configFileHint') }}</p>
          <div class="config-actions">
            <DwButton variant="primary" type="button" @click="onExport">
              <DwIcon name="export" size="sm" :stroke-width="1.5"/>
              {{ t('settings.layout.export') }}
            </DwButton>
            <DwButton variant="secondary" type="button" @click="onImportClick">
              <DwIcon name="import" size="sm" :stroke-width="1.5"/>
              {{ t('settings.layout.import') }}
            </DwButton>
            <input
                ref="fileInputRef"
                type="file"
                accept="application/json,.json"
                hidden
                @change="onFileChange"
            />
          </div>
          <p class="config-note">{{ t('settings.layout.configNote') }}</p>
          <DwButton
              variant="ghost"
              size="sm"
              type="button"
              class="layout-portability-link"
              @click="layout.openSettingsModule('configPortability')"
          >
            {{ t('settings.basic.backupHub.openPortability') }}
          </DwButton>
        </div>
      </section>
    </div>
  </SettingsPageShell>
</template>

<style scoped>
.toggle-group + .toggle-group {
  margin-top: clamp(10px, 1.2vmin, 12px);
}

.toggle-group__label {
  display: block;
  margin-bottom: clamp(6px, 0.8vmin, 8px);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.toggle-grid {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap);
}

.panel-toggle-copy {
  min-width: 0;
}

.panel-explorer-toggle {
  grid-column: 1 / -1;
  margin-top: clamp(10px, 1.2vmin, 12px);
}

.panel-reset-row {
  grid-column: 1 / -1;
  margin-top: clamp(12px, 1.4vmin, 14px);
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-sm);
}

.panel-reset-row__hint {
  margin: 0;
}

.config-card__body {
  min-width: 0;
}

.config-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap-md);
  margin-top: clamp(10px, 1.2vmin, 12px);
}
</style>
