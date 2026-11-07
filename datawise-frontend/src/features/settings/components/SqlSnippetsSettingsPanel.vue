<script setup lang="ts">
import {computed, onBeforeMount, ref, shallowRef} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwIcon} from '@/core/icons'
import {DwButton} from '@/core/components'
import {SqlSnippetsEditorWorkbench} from '@datawise/sql-editor'
import {UserResource} from '@/features/auth/types/user-resource.types'
import {useResourceWriteGuard} from '@/features/auth/composables/useResourceWriteGuard'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {getAppSqlEditorShortcutsController} from '@/features/settings/services/sql-editor-shortcuts.controller'
import {ensureSqlEditorPlugin} from '@/features/workspace/services/ensure-sql-editor-plugin'
import {useSqlEditorShortcutsStore} from '@/features/settings/stores/sql-editor-shortcuts-store'
import SettingsPageShell from '@/features/settings/components/SettingsPageShell.vue'
import SettingsTipsCard from '@/features/settings/components/SettingsTipsCard.vue'
import SqlSnippetsSourcesBar from '@/features/settings/components/SqlSnippetsSourcesBar.vue'
import DwPanelState from '@/core/components/DwPanelState.vue'

const {t} = useI18n()
const toast = useAppToast()
const store = useSqlEditorShortcutsStore()
const snippetsReady = ref(false)
const controller = shallowRef<ReturnType<typeof getAppSqlEditorShortcutsController> | null>(null)
const workbenchRef = ref<InstanceType<typeof SqlSnippetsEditorWorkbench> | null>(null)
const sharedFileInputRef = ref<HTMLInputElement>()
const newSnippetSignal = ref(0)

const {readOnly: sharedReadOnly, denyIfReadOnly: denySharedWrite} =
    useResourceWriteGuard(UserResource.SqlSnippetsShared)
const {readOnly: personalReadOnly, hint: personalHint, denyIfReadOnly: denyPersonalWrite} =
    useResourceWriteGuard(UserResource.SqlSnippetsPersonal)
const readOnly = computed(() => sharedReadOnly.value || personalReadOnly.value)

onBeforeMount(async () => {
    await ensureSqlEditorPlugin()
    const next = getAppSqlEditorShortcutsController()
    next.reloadFromPersistence()
    controller.value = next
    snippetsReady.value = true
})

function onAddSnippet() {
  if (denyPersonalWrite()) return
  newSnippetSignal.value += 1
}

function onSnippetSaved() {
  toast.success(t('settings.sqlSnippets.saved'))
}

function onImportShared() {
  if (denySharedWrite()) return
  sharedFileInputRef.value?.click()
}

function onResetPersonal() {
  if (denyPersonalWrite()) return
  store.resetPersonal()
  workbenchRef.value?.closeEditor()
}

async function onSharedFileChange(event: Event) {
  if (denySharedWrite()) return
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  try {
    const text = await file.text()
    const ok = store.importSharedConfigText(text)
    if (ok) toast.success(t('settings.sqlEditor.sharedImportSuccess'))
    else toast.error(t('settings.sqlEditor.sharedImportFailed'))
  } catch {
    toast.error(t('settings.sqlEditor.sharedImportFailed'))
  }
}
</script>

<template>
  <!-- settings content recipe: split -->
  <SettingsPageShell
      :title="t('settings.sqlSnippets.title')"
      :subtitle="t('settings.sqlSnippets.subtitle')"
      :readonly="personalReadOnly"
      :readonly-hint="personalHint"
  >
    <template #actions>
      <DwButton
          variant="secondary"
          size="sm"
          type="button"
          :disabled="readOnly"
          @click="onResetPersonal"
      >
        <DwIcon name="refresh" size="sm" :stroke-width="1.5"/>
        {{ t('settings.sqlEditor.resetPersonal') }}
      </DwButton>
    </template>

    <template #tips>
      <SettingsTipsCard
          :title="t('settings.sqlEditor.tipsTitle')"
          :content="t('settings.sqlEditor.tipsContent')"
          icon="terminal"
      />
    </template>

    <div class="settings-groups">
      <SqlSnippetsSourcesBar/>

      <div class="sql-snippets-settings__toolbar">
        <DwButton
            variant="primary"
            type="button"
            :disabled="readOnly"
            @click="onAddSnippet"
        >
          + {{ t('settings.sqlSnippets.add') }}
        </DwButton>
        <DwButton
            variant="secondary"
            type="button"
            :disabled="sharedReadOnly"
            @click="onImportShared"
        >
          {{ t('settings.sqlEditor.sharedImport') }}
        </DwButton>
        <DwButton
            variant="secondary"
            type="button"
            :disabled="sharedReadOnly"
            @click="store.exportSharedConfig"
        >
          {{ t('settings.sqlEditor.sharedExport') }}
        </DwButton>
      </div>

      <SqlSnippetsEditorWorkbench
          v-if="snippetsReady && controller"
          ref="workbenchRef"
          :controller="controller!"
          :readonly="readOnly"
          :new-snippet-signal="newSnippetSignal"
          @saved="onSnippetSaved"
      />
      <DwPanelState
          v-else
          status="loading"
          fill
          :message="t('common.editorLoading')"
      />
    </div>

    <input
        ref="sharedFileInputRef"
        type="file"
        accept="application/json,.json"
        hidden
        @change="onSharedFileChange"
    />
  </SettingsPageShell>
</template>
