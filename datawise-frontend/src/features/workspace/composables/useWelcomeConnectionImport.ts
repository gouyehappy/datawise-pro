import {ref, shallowRef} from 'vue'
import {useI18n} from 'vue-i18n'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {
    profileImportConnectionCount,
} from '@/features/explorer/services/import-connection-file.service'
import {planConnectionImportFile} from '@/features/explorer/services/plan-connection-import-file'
import {
    draftsToConnectionConfigs,
    THIRD_PARTY_IMPORT_ACCEPT,
    type ThirdPartyImportParseResult,
} from '@/features/explorer/services/third-party-connection-import'
import {resolveConnectionCatalogErrorMessage} from '@/features/connection/services/connection-catalog.service'
import {
    importProfilePackage,
    preflightProfilePackage,
} from '@/features/settings/services/config-portability.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

/** Welcome 页连接导入对话框（本机 profile / 第三方）状态与确认流 */
export function useWelcomeConnectionImport() {
  const {t} = useI18n()
  const explorer = useExplorerStore()
  const layout = useLayoutStore()

  const showImportDialog = ref(false)
  const importFile = ref<File | null>(null)
  const importBusy = ref(false)
  const showThirdPartyImportDialog = ref(false)
  const thirdPartyParse = shallowRef<ThirdPartyImportParseResult | null>(null)
  const thirdPartyFileName = ref('')
  const thirdPartyBusy = ref(false)

  function openImportConnections() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = THIRD_PARTY_IMPORT_ACCEPT
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      void handleImportFile(file)
    }
    input.click()
  }

  async function handleImportFile(file: File) {
    try {
      const plan = await planConnectionImportFile(file)
      if (plan.kind === 'dwprofile') {
        importFile.value = plan.file
        showImportDialog.value = true
        return
      }
      if (plan.kind === 'third-party') {
        thirdPartyParse.value = plan.parse
        thirdPartyFileName.value = plan.fileName
        showThirdPartyImportDialog.value = true
        return
      }
      const count = await explorer.importConnections(plan.connections)
      await explorer.refreshTree()
      layout.notifyQuiet({
        category: 'workspace',
        titleKey: 'importDone',
        bodyKey: 'importDone',
        params: {detail: t('explorer.importSuccess', {count})},
      })
    } catch (error) {
      layout.showErrorToast(
          resolveConnectionCatalogErrorMessage(error, t, 'save')
          || t('explorer.importFailed'),
      )
    }
  }

  function onImportDialogOpenChange(open: boolean) {
    showImportDialog.value = open
    if (!open && !importBusy.value) {
      importFile.value = null
    }
  }

  function onThirdPartyImportOpenChange(open: boolean) {
    showThirdPartyImportDialog.value = open
    if (!open && !thirdPartyBusy.value) {
      thirdPartyParse.value = null
      thirdPartyFileName.value = ''
    }
  }

  async function confirmThirdPartyImport() {
    const parse = thirdPartyParse.value
    if (!parse?.drafts.length) {
      layout.showErrorToast(t('explorer.thirdPartyImport.empty'))
      return
    }
    thirdPartyBusy.value = true
    try {
      const configs = draftsToConnectionConfigs(parse.drafts)
      const count = await explorer.importConnections(configs)
      await explorer.refreshTree()
      showThirdPartyImportDialog.value = false
      thirdPartyParse.value = null
      thirdPartyFileName.value = ''
      layout.notifyQuiet({
        category: 'workspace',
        titleKey: 'importDone',
        bodyKey: 'importDone',
        params: {detail: t('explorer.importSuccess', {count})},
      })
    } catch (error) {
      layout.showErrorToast(
          resolveConnectionCatalogErrorMessage(error, t, 'save')
          || t('explorer.importFailed'),
      )
    } finally {
      thirdPartyBusy.value = false
    }
  }

  async function confirmImportProfilePackage(payload: {passphrase: string}) {
    const file = importFile.value
    if (!file) {
      layout.showErrorToast(t('explorer.importFailed'))
      return
    }
    importBusy.value = true
    try {
      const preflight = await preflightProfilePackage(file, payload.passphrase)
      if (!preflight.passphraseOk) {
        layout.showErrorToast(t('settings.configPortability.passphraseIncorrect'))
        return
      }
      if (!preflight.schemaCompatible) {
        layout.showErrorToast(t('settings.configPortability.schemaUnsupported'))
        return
      }
      const result = await importProfilePackage(file, payload.passphrase, {
        connections: true,
        app: false,
        snippets: false,
        aiWorkspace: false,
        projects: false,
        savedConsoles: false,
        sqlHistory: false,
        projectFileConflict: 'preferImported',
      })
      await explorer.refreshTree()
      const count = profileImportConnectionCount(result.counts)
      showImportDialog.value = false
      importFile.value = null
      if (count <= 0) {
        layout.showWarningToast(t('explorer.importConnectionEmpty'))
        return
      }
      layout.notifyQuiet({
        category: 'workspace',
        titleKey: 'importDone',
        bodyKey: 'importDone',
        params: {detail: t('explorer.importSuccess', {count})},
      })
    } catch (error) {
      layout.showErrorToast(
          resolveCaughtApiErrorMessage(error, t, 'explorer.importFailed'),
      )
    } finally {
      importBusy.value = false
    }
  }

  return {
    showImportDialog,
    importFile,
    importBusy,
    showThirdPartyImportDialog,
    thirdPartyParse,
    thirdPartyFileName,
    thirdPartyBusy,
    openImportConnections,
    onImportDialogOpenChange,
    onThirdPartyImportOpenChange,
    confirmThirdPartyImport,
    confirmImportProfilePackage,
  }
}
