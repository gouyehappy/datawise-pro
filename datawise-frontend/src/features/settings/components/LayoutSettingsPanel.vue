<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'
import {DwButton, SettingsRow, SettingsSwitch} from '@/core/components'
import LayoutWorkbenchPreview from '@/features/settings/components/LayoutWorkbenchPreview.vue'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import SettingsGroup from '@/features/settings/components/SettingsGroup.vue'
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
const fileInputEl = ref<HTMLInputElement>()

const leftMainItems = computed(() =>
    appConfig.sideRailItems.filter((item) => item.section === 'main'),
)
const leftUtilItems = computed(() =>
    appConfig.sideRailItems.filter((item) => item.section === 'util'),
)
const leftBottomItems = computed(() =>
    appConfig.sideRailItems.filter((item) => item.section === 'bottom'),
)

const showProjectDocsRoot = computed(() => appConfig.preferences.showProjectDocsRoot !== false)
const showProjectScriptsRoot = computed(() => appConfig.preferences.showProjectScriptsRoot !== false)

function onToggleProjectFileRoot(root: 'docs' | 'scripts', visible: boolean) {
  if (denyIfReadOnly()) return
  appConfig.setProjectFileRootVisible(root, visible)
  void explorer.refreshTree()
}

function onSideRailToggle(id: string, visible: boolean) {
  if (denyIfReadOnly()) return
  // id 来自 appConfig.sideRailItems 配置，运行期已是合法的 SideRailItemId
  appConfig.setSideRailVisible(id as Parameters<typeof appConfig.setSideRailVisible>[0], visible)
}

function onShortcutToggle(id: string, visible: boolean) {
  if (denyIfReadOnly()) return
  // id 来自 appConfig.shortcutPanels 配置，运行期已是合法的 ShortcutPanel
  appConfig.setShortcutVisible(id as Parameters<typeof appConfig.setShortcutVisible>[0], visible)
}

function onResetDockPlacement() {
  if (denyIfReadOnly()) return
  appConfig.resetDockPlacement()
}

function onExport() {
  if (denyIfReadOnly()) return
  appConfig.exportConfig()
  toast.notify({
    category: 'export',
    titleKey: 'exportDone',
    bodyKey: 'exportDone',
    params: {name: t('settings.layout.exportSuccess')},
  })
}

function onImportClick() {
  fileInputEl.value?.click()
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
    if (!ok) toast.error(t('settings.layout.importFailed'))
  } catch {
    toast.error(t('settings.layout.importFailed'))
  }
}
</script>

<template>
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

      <SettingsGroup
          :title="t('settings.layout.leftRail')"
          :hint="t('settings.layout.leftRailHint')"
      >
        <p class="settings-section__subgroup">{{ t('settings.layout.groupMain') }}</p>
        <SettingsSwitch
            v-for="item in leftMainItems"
            :key="item.id"
            :label="t(item.labelKey)"
            :hint="t(item.captionKey)"
            :model-value="item.visible"
            :disabled="guestReadOnly"
            @update:model-value="onSideRailToggle(item.id, $event)"
        />
        <p class="settings-section__subgroup">{{ t('settings.layout.groupUtil') }}</p>
        <SettingsSwitch
            v-for="item in leftUtilItems"
            :key="item.id"
            :label="t(item.labelKey)"
            :hint="t(item.captionKey)"
            :model-value="item.visible"
            :disabled="guestReadOnly"
            @update:model-value="onSideRailToggle(item.id, $event)"
        />
        <template v-if="leftBottomItems.length">
          <p class="settings-section__subgroup">{{ t('settings.layout.groupBottom') }}</p>
          <SettingsSwitch
              v-for="item in leftBottomItems"
              :key="item.id"
              :label="t(item.labelKey)"
              :hint="t(item.captionKey)"
              :model-value="item.visible"
              :disabled="guestReadOnly"
              @update:model-value="onSideRailToggle(item.id, $event)"
          />
        </template>
      </SettingsGroup>

      <SettingsGroup
          :title="t('settings.layout.rightRail')"
          :hint="t('settings.layout.rightRailHint')"
      >
        <SettingsSwitch
            v-for="item in appConfig.shortcutRailItems"
            :key="item.id"
            :label="t(item.labelKey)"
            :hint="t(item.captionKey)"
            :model-value="item.visible"
            :disabled="guestReadOnly"
            @update:model-value="onShortcutToggle(item.id, $event)"
        />
      </SettingsGroup>

      <SettingsGroup
          id="settings-layout-explorer-display"
          :title="t('settings.layout.panels')"
          :hint="t('settings.layout.panelsHint')"
      >
        <SettingsSwitch
            :label="t('settings.layout.showExplorer')"
            :hint="t('settings.layout.showExplorerHint')"
            :model-value="appConfig.showExplorerPanel"
            :disabled="guestReadOnly"
            @update:model-value="appConfig.setShowExplorerPanel($event)"
        />
        <SettingsRow
            :label="t('settings.layout.resetDockPlacement')"
            :hint="t('settings.layout.resetDockPlacementHint')"
            :disabled="guestReadOnly"
        >
          <DwButton variant="secondary" size="sm" type="button" @click="onResetDockPlacement">
            {{ t('settings.layout.resetDockPlacement') }}
          </DwButton>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
          :title="t('settings.layout.explorerDisplay')"
          :hint="t('settings.layout.explorerDisplayHint')"
      >
        <SettingsSwitch
            :label="t('explorer.showColumnComment')"
            :hint="t('settings.layout.explorerAlsoInToolbar')"
            :model-value="explorer.showColumnComment"
            :disabled="guestReadOnly"
            @update:model-value="explorer.showColumnComment = $event"
        />
        <SettingsSwitch
            :label="t('explorer.showTableComment')"
            :hint="t('settings.layout.explorerAlsoInToolbar')"
            :model-value="explorer.showTableComment"
            :disabled="guestReadOnly"
            @update:model-value="explorer.showTableComment = $event"
        />
        <SettingsSwitch
            :label="t('explorer.showSemanticLayer')"
            :hint="t('settings.layout.explorerAlsoInToolbar')"
            :model-value="explorer.showSemanticLayer"
            :disabled="guestReadOnly"
            @update:model-value="explorer.showSemanticLayer = $event"
        />
      </SettingsGroup>

      <SettingsGroup
          id="settings-layout-project-file-roots"
          :title="t('settings.layout.projectFileRoots')"
          :hint="t('settings.layout.projectFileRootsHint')"
      >
        <SettingsSwitch
            :label="t('settings.layout.projectDocsRoot')"
            :hint="t('settings.layout.projectDocsRootCaption')"
            :model-value="showProjectDocsRoot"
            :disabled="guestReadOnly"
            @update:model-value="onToggleProjectFileRoot('docs', $event)"
        />
        <SettingsSwitch
            :label="t('settings.layout.projectScriptsRoot')"
            :hint="t('settings.layout.projectScriptsRootCaption')"
            :model-value="showProjectScriptsRoot"
            :disabled="guestReadOnly"
            @update:model-value="onToggleProjectFileRoot('scripts', $event)"
        />
      </SettingsGroup>

      <SettingsGroup
          :title="t('settings.layout.configFile')"
          :hint="t('settings.layout.configFileHint')"
      >
        <SettingsRow :label="t('settings.layout.export')" :hint="t('settings.layout.configNote')">
          <div class="layout-config-actions">
            <DwButton variant="primary" size="sm" type="button" @click="onExport">
              <DwIcon name="export" size="sm" :stroke-width="1.5"/>
              {{ t('settings.layout.export') }}
            </DwButton>
            <DwButton variant="secondary" size="sm" type="button" @click="onImportClick">
              <DwIcon name="import" size="sm" :stroke-width="1.5"/>
              {{ t('settings.layout.import') }}
            </DwButton>
          </div>
        </SettingsRow>
        <SettingsRow :label="t('settings.basic.backupHub.openPortability')">
          <DwButton
              variant="ghost"
              size="sm"
              type="button"
              @click="layout.openSettingsModule('configPortability')"
          >
            {{ t('settings.basic.backupHub.openPortability') }}
          </DwButton>
        </SettingsRow>
        <input
            ref="fileInputEl"
            type="file"
            accept="application/json,.json"
            hidden
            @change="onFileChange"
        />
      </SettingsGroup>
    </div>
  </SettingsPageShell>
</template>

<style scoped>
.settings-section__subgroup {
  margin: var(--dw-space-3) 0 var(--dw-space-1);
  padding-top: var(--dw-space-2);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--dw-text-muted);
}

.settings-section__subgroup:first-child {
  margin-top: var(--dw-space-1);
  padding-top: 0;
}

.layout-config-actions {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--dw-gap-sm);
  justify-content: flex-end;
}

.preview-section {
  min-width: 0;
}
</style>
