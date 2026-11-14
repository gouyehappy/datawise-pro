import {computed, onMounted, onUnmounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useConfirmDialog} from '@/core/composables/useConfirmDialog'
import {
  createHttpCommunityPluginsApi,
  type CommunityPluginCatalog,
  type CommunityPluginCatalogEntry,
  type CommunityPluginInfo,
  type CommunityPluginRepository,
  type CommunityPluginTrustKey,
} from '@/shared/api/http/community-plugins'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {isDesktopApp} from '@/features/layout/services/desktop-chrome'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import type {ConnectionConfig} from '@/core/types'
import {
  communityPluginContributionDescription,
  communityPluginContributionLabel,
  communityPluginDisplayDescription,
  communityPluginAlternateName,
  communityPluginBaseName,
  communityPluginDisplayName,
  resolveCommunityPluginLocalization,
  scopedCommunityPluginLocalization,
} from '@/features/community-plugin/lib/community-plugin-locale'
import {useCommunityPluginCenterUiStore} from '@/features/community-plugin/stores/community-plugin-center-ui'
import {
  connectAndOpenCommunityPluginWorkbench,
  isSessionBoundFilesystemContribution,
  listSavedPluginConnections,
  type CommunityPluginWorkbenchIntent,
} from '@/features/community-plugin/lib/connectCommunityPluginWorkbench'
import {resolveCaughtApiErrorMessage, resolveCaughtMessage} from '@/shared/api/http/api-error-message'

const ALLOW_UNSIGNED_KEY = 'datawise-community-plugin-allow-unsigned'

export type CommunityPluginListSelection =
  | {kind: 'installed'; pluginId: string}
  | {kind: 'store'; catalogId: string; pluginId: string}

export type MarketplaceListItem = {
  catalogId: string
  catalogName: string
  source?: string
  repositoryId?: string
  entry: CommunityPluginCatalogEntry
}

export function useCommunityPluginCenter() {
  const {t, te, locale} = useI18n()
  const toast = useAppToast()

  function caughtError(e: unknown, fallbackKey: string): string {
    return resolveCaughtApiErrorMessage(e, t, fallbackKey)
  }
  const api = createHttpCommunityPluginsApi()
  const workspace = useWorkspaceStore()
  const ui = useCommunityPluginCenterUiStore()
  const {
    open: confirmOpen,
    title: confirmTitle,
    message: confirmMessage,
    confirmLabel,
    confirmVariant,
    ask: askConfirm,
    onConfirm: onConfirmDialog,
    onOpenUpdate: onConfirmOpenUpdate,
  } = useConfirmDialog()

  const plugins = ref<CommunityPluginInfo[]>([])
  const catalogs = ref<CommunityPluginCatalog[]>([])
  const trustKeys = ref<CommunityPluginTrustKey[]>([])
  const repositories = ref<CommunityPluginRepository[]>([])
  const trustKeyDraft = ref({id: '', label: '', publicKeyBase64: ''})
  const repoDraft = ref({id: '', name: '', url: '', enabled: true})
  const savingTrust = ref(false)
  const savingRepos = ref(false)
  const loading = ref(false)
  const error = ref('')
  /** Compatibility warnings (e.g. missing sidecar binary) surfaced after install. */
  const installWarnings = ref<string[]>([])
  const selectedId = ref('')
  const selectedStoreKey = ref('')
  const searchQuery = ref('')
  const settingsOpen = ref(false)
  const installMenuOpen = ref(false)
  const installPath = ref('')
  const installUrl = ref('')
  const allowUnsigned = ref(readAllowUnsigned())
  const installing = ref(false)
  const installingCatalogKey = ref('')
  const fileInputRef = ref<HTMLInputElement | null>(null)
  const pluginConnections = ref<ConnectionConfig[]>([])

  const selected = computed(() => plugins.value.find((p) => p.manifest.id === selectedId.value) || null)

  const catalogFetchErrors = computed(() =>
    catalogs.value.filter((catalog) => Boolean(catalog.error)),
  )

  const marketplaceEntries = computed<MarketplaceListItem[]>(() =>
    catalogs.value.flatMap((catalog) =>
      (catalog.entries || []).map((entry) => ({
        catalogId: catalog.id,
        catalogName: catalog.name,
        source: catalog.source,
        repositoryId: catalog.repositoryId,
        entry,
      })),
    ),
  )

  const selectedStoreItem = computed(() =>
    marketplaceEntries.value.find((item) => `${item.catalogId}:${item.entry.id}` === selectedStoreKey.value) || null,
  )

  const query = computed(() => searchQuery.value.trim().toLowerCase())

  const filteredInstalled = computed(() => {
    const q = query.value
    if (!q) return plugins.value
    return plugins.value.filter((plugin) => {
      const loc = resolveCommunityPluginLocalization(plugin.manifest, locale.value)
      const name = communityPluginDisplayName(plugin, loc).toLowerCase()
      const base = communityPluginBaseName(plugin).toLowerCase()
      const id = plugin.manifest.id.toLowerCase()
      const publisher = (plugin.manifest.publisher || '').toLowerCase()
      return name.includes(q) || base.includes(q) || id.includes(q) || publisher.includes(q)
    })
  })

  const filteredStore = computed(() => {
    const q = query.value
    if (!q) return marketplaceEntries.value
    return marketplaceEntries.value.filter((item) => {
      const name = (item.entry.name || '').toLowerCase()
      return name.includes(q)
        || item.entry.id.toLowerCase().includes(q)
        || (item.entry.publisher || '').toLowerCase().includes(q)
        || item.catalogName.toLowerCase().includes(q)
    })
  })

  const contributions = computed(() => {
    const list = selected.value?.manifest.contributions || []
    return list as Array<{
      type?: string
      id?: string
      label?: string
      description?: string
      capabilities?: string[]
      rootUri?: string
      schemes?: string[]
      sessionBound?: boolean
      openTarget?: string
    }>
  })

  async function refreshPluginConnections(pluginId = selectedId.value) {
    if (!pluginId) {
      pluginConnections.value = []
      return
    }
    pluginConnections.value = await listSavedPluginConnections(pluginId)
  }

  function catalogSourceLabel(source?: string) {
    if (source === 'builtin') return t('communityPlugin.catalogSource.builtin')
    if (source === 'repository') return t('communityPlugin.catalogSource.repository')
    return source || ''
  }

  function readAllowUnsigned(): boolean {
    try {
      const raw = localStorage.getItem(ALLOW_UNSIGNED_KEY)
      if (raw == null) return true
      return raw === 'true'
    } catch {
      return true
    }
  }

  function persistAllowUnsigned(value: boolean) {
    try {
      localStorage.setItem(ALLOW_UNSIGNED_KEY, String(value))
    } catch {
      /* ignore */
    }
  }

  function pluginLocalization(plugin: CommunityPluginInfo) {
    return resolveCommunityPluginLocalization(plugin.manifest, locale.value)
  }

  function pluginName(plugin: CommunityPluginInfo) {
    return communityPluginDisplayName(plugin, pluginLocalization(plugin))
  }

  function pluginListTitle(plugin: CommunityPluginInfo) {
    return communityPluginBaseName(plugin) || pluginName(plugin)
  }

  function pluginListMeta(plugin: CommunityPluginInfo) {
    const version = `v${plugin.manifest.version}`
    const alt = communityPluginAlternateName(plugin, pluginLocalization(plugin))
    if (alt) return `${alt} · ${version}`
    const publisher = plugin.manifest.publisher
    return publisher ? `${version} · ${publisher}` : version
  }

  function pluginDescription(plugin: CommunityPluginInfo) {
    return communityPluginDisplayDescription(plugin, pluginLocalization(plugin))
  }

  function contributionLabel(contribution: {id?: string; label?: string}, plugin?: CommunityPluginInfo) {
    const scoped = plugin ? scopedCommunityPluginLocalization(pluginLocalization(plugin), contribution.id) : {}
    return communityPluginContributionLabel(contribution, scoped)
  }

  function contributionDescription(contribution: {id?: string; description?: string}, plugin?: CommunityPluginInfo) {
    const scoped = plugin ? scopedCommunityPluginLocalization(pluginLocalization(plugin), contribution.id) : {}
    return communityPluginContributionDescription(contribution, scoped)
  }

  function contributionTypeLabel(type?: string) {
    if (!type) return ''
    const key = `communityPlugin.contributionTypes.${type}`
    return te(key) ? t(key) : type
  }

  function storeEntryName(item: MarketplaceListItem) {
    return item.entry.name || item.entry.id
  }

  function storeEntryDescription(item: MarketplaceListItem) {
    return item.entry.description || ''
  }

  function selectInstalled(pluginId: string) {
    selectedId.value = pluginId
    selectedStoreKey.value = ''
    void refreshPluginConnections(pluginId)
  }

  function selectStoreItem(item: MarketplaceListItem) {
    selectedStoreKey.value = `${item.catalogId}:${item.entry.id}`
    if (item.entry.status === 'installed') {
      selectedId.value = item.entry.id
    } else {
      selectedId.value = ''
    }
  }

  async function refresh() {
    loading.value = true
    error.value = ''
    try {
      const [listed, catalogPayload, keys, repos] = await Promise.all([
        api.list(),
        api.catalogs().catch(() => ({catalogs: [] as CommunityPluginCatalog[]})),
        api.listTrustKeys().catch(() => [] as CommunityPluginTrustKey[]),
        api.listRepositories().catch(() => [] as CommunityPluginRepository[]),
      ])
      plugins.value = listed
      catalogs.value = catalogPayload.catalogs || []
      trustKeys.value = keys || []
      repositories.value = repos || []
      if (!selectedId.value && !selectedStoreKey.value && plugins.value.length) {
        selectedId.value = plugins.value[0].manifest.id
      }
      if (selectedId.value && !plugins.value.some((p) => p.manifest.id === selectedId.value)) {
        selectedId.value = plugins.value[0]?.manifest.id || ''
      }
      await refreshPluginConnections(selectedId.value)
    } catch (e) {
      error.value = caughtError(e, 'communityPlugin.loadFailed')
    } finally {
      loading.value = false
    }
  }

  function notifyCommunityPluginChanged() {
    window.dispatchEvent(new CustomEvent('dw-community-plugin-changed'))
  }

  function noteInstallWarnings(plugin: CommunityPluginInfo | undefined) {
    installWarnings.value = plugin?.compatibility.warnings?.filter((w) => w.trim()) ?? []
  }

  async function afterInstall(pluginId: string) {
    selectedId.value = pluginId
    selectedStoreKey.value = ''
    settingsOpen.value = false
    installMenuOpen.value = false
    await refresh()
    notifyCommunityPluginChanged()
  }

  async function installFromPath() {
    if (!installPath.value.trim() || installing.value) return
    installing.value = true
    error.value = ''
    installWarnings.value = []
    try {
      const result = await api.installFromPath(installPath.value.trim(), allowUnsigned.value)
      noteInstallWarnings(result.plugin)
      await afterInstall(result.plugin.manifest.id)
    } catch (e) {
      error.value = caughtError(e, 'communityPlugin.actionFailed')
    } finally {
      installing.value = false
    }
  }

  async function installFromUrl() {
    if (!installUrl.value.trim() || installing.value) return
    installing.value = true
    error.value = ''
    installWarnings.value = []
    try {
      const result = await api.installFromUrl(installUrl.value.trim(), allowUnsigned.value)
      noteInstallWarnings(result.plugin)
      await afterInstall(result.plugin.manifest.id)
    } catch (e) {
      error.value = caughtError(e, 'communityPlugin.actionFailed')
    } finally {
      installing.value = false
    }
  }

  async function installFromCatalog(catalogId: string, pluginId: string) {
    if (!catalogId || !pluginId || installing.value) return
    const key = `${catalogId}:${pluginId}`
    installing.value = true
    installingCatalogKey.value = key
    error.value = ''
    installWarnings.value = []
    try {
      const result = await api.installFromCatalog(catalogId, pluginId)
      noteInstallWarnings(result.plugin)
      await afterInstall(result.plugin.manifest.id)
    } catch (e) {
      error.value = caughtError(e, 'communityPlugin.actionFailed')
    } finally {
      installing.value = false
      installingCatalogKey.value = ''
    }
  }

  async function installFromFile(file: File | null | undefined) {
    if (!file || installing.value) return
    installing.value = true
    error.value = ''
    installWarnings.value = []
    try {
      const result = await api.installUpload(file, allowUnsigned.value)
      installPath.value = file.name
      noteInstallWarnings(result.plugin)
      await afterInstall(result.plugin.manifest.id)
    } catch (e) {
      error.value = caughtError(e, 'communityPlugin.actionFailed')
    } finally {
      installing.value = false
      if (fileInputRef.value) fileInputRef.value.value = ''
    }
  }

  async function addTrustKey() {
    const id = trustKeyDraft.value.id.trim()
    const publicKeyBase64 = trustKeyDraft.value.publicKeyBase64.trim()
    if (!id || !publicKeyBase64 || savingTrust.value) return
    savingTrust.value = true
    error.value = ''
    try {
      const next = [
        ...trustKeys.value.filter((key) => key.id !== id),
        {id, label: trustKeyDraft.value.label.trim() || id, publicKeyBase64},
      ]
      trustKeys.value = await api.replaceTrustKeys(next)
      trustKeyDraft.value = {id: '', label: '', publicKeyBase64: ''}
    } catch (e) {
      error.value = caughtError(e, 'communityPlugin.actionFailed')
    } finally {
      savingTrust.value = false
    }
  }

  async function removeTrustKey(keyId: string) {
    if (!keyId || savingTrust.value) return
    savingTrust.value = true
    error.value = ''
    try {
      trustKeys.value = await api.replaceTrustKeys(trustKeys.value.filter((key) => key.id !== keyId))
    } catch (e) {
      error.value = caughtError(e, 'communityPlugin.actionFailed')
    } finally {
      savingTrust.value = false
    }
  }

  async function addRepository() {
    const id = repoDraft.value.id.trim()
    const url = repoDraft.value.url.trim()
    if (!id || !url || savingRepos.value) return
    savingRepos.value = true
    error.value = ''
    try {
      const next = [
        ...repositories.value.filter((repo) => repo.id !== id),
        {
          id,
          name: repoDraft.value.name.trim() || id,
          url,
          enabled: repoDraft.value.enabled,
        },
      ]
      repositories.value = await api.replaceRepositories(next)
      repoDraft.value = {id: '', name: '', url: '', enabled: true}
      await refresh()
    } catch (e) {
      error.value = caughtError(e, 'communityPlugin.actionFailed')
    } finally {
      savingRepos.value = false
    }
  }

  async function removeRepository(repoId: string) {
    if (!repoId || savingRepos.value) return
    savingRepos.value = true
    error.value = ''
    try {
      repositories.value = await api.replaceRepositories(repositories.value.filter((repo) => repo.id !== repoId))
      await refresh()
    } catch (e) {
      error.value = caughtError(e, 'communityPlugin.actionFailed')
    } finally {
      savingRepos.value = false
    }
  }

  function onPickFile(event: Event) {
    const input = event.target as HTMLInputElement
    void installFromFile(input.files?.[0])
  }

  function onDragOver(event: DragEvent) {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  }

  function onDropFile(event: DragEvent) {
    event.preventDefault()
    event.stopPropagation()
    const file = event.dataTransfer?.files?.[0]
    if (!file) {
      if (isDesktopApp()) {
        toast.show(t('communityPlugin.dropDesktopHint'))
      }
      return
    }
    if (!file.name.toLowerCase().endsWith('.dwp')) {
      error.value = t('communityPlugin.dropRejected')
      if (isDesktopApp()) {
        toast.warning(t('communityPlugin.dropRejected'))
      }
      return
    }
    void installFromFile(file)
  }

  function onCommunityPluginChanged() {
    void refresh()
  }

  async function uninstallSelected() {
    if (!selectedId.value || !selected.value) return
    const name = pluginName(selected.value)
    const confirmed = await askConfirm({
      title: t('communityPlugin.confirmUninstallTitle'),
      message: t('communityPlugin.confirmUninstallMessage', {name}),
      confirmLabel: t('communityPlugin.uninstall'),
      confirmVariant: 'danger',
    })
    if (!confirmed) return
    try {
      await api.uninstall(selectedId.value)
      selectedId.value = ''
      await refresh()
      notifyCommunityPluginChanged()
    } catch (e) {
      error.value = caughtError(e, 'communityPlugin.actionFailed')
    }
  }

  async function rollbackSelected() {
    if (!selectedId.value || !selected.value) return
    const name = pluginName(selected.value)
    const confirmed = await askConfirm({
      title: t('communityPlugin.confirmRollbackTitle'),
      message: t('communityPlugin.confirmRollbackMessage', {name}),
      confirmLabel: t('communityPlugin.rollback'),
    })
    if (!confirmed) return
    error.value = ''
    try {
      const result = await api.rollback(selectedId.value)
      await afterInstall(result.plugin.manifest.id)
    } catch (e) {
      error.value = caughtError(e, 'communityPlugin.actionFailed')
    }
  }

  function openWorkbench(contribution: {id?: string; label?: string}) {
    if (!selectedId.value || !contribution.id) return
    void launchPluginWorkbench({
      contributionId: contribution.id,
      title: contributionLabel(contribution),
    })
  }

  function workbenchInstanceIdOf(tab: {pluginHostContext?: Record<string, unknown>}): string | undefined {
    const id = tab.pluginHostContext?.workbenchId
    return typeof id === 'string' && id.trim() ? id.trim() : undefined
  }

  function openConnectionFormForPlugin() {
    const connection = contributions.value.find((c) => c.type === 'connection-provider')
    if (connection) {
      openConnectionProvider(connection)
      return
    }
    error.value = t('communityPlugin.needsConnection')
  }

  /**
   * Cold start from plugin center: never open a bare workbench without connectionId.
   * Reuse a live tab, else connect a saved plugin connection, else guide create-one.
   */
  async function launchPluginWorkbench(options: {
    contributionId?: string
    title?: string
    intent?: CommunityPluginWorkbenchIntent
  }) {
    const pluginId = selectedId.value
    if (!pluginId) return
    error.value = ''

    const live = [...workspace.tabs]
      .reverse()
      .find(
        (tab) =>
          tab.type === 'community-workbench'
          && tab.pluginId === pluginId
          && Boolean(tab.connectionId),
      )
    if (live) {
      const prev = (live.pluginHostContext && typeof live.pluginHostContext === 'object')
        ? live.pluginHostContext
        : {}
      workspace.openCommunityWorkbench(
        pluginId,
        live.pluginContributionId || options.contributionId,
        live.title || options.title,
        {
          connectionId: live.connectionId,
          workbenchInstanceId: workbenchInstanceIdOf(live),
          pluginHostContext: {
            ...prev,
            connectionId: live.connectionId,
            ...(options.intent ? {intent: options.intent} : {}),
          },
        },
      )
      return
    }

    const saved = await listSavedPluginConnections(pluginId)
    if (saved.length === 0) {
      openConnectionFormForPlugin()
      if (!error.value) error.value = t('communityPlugin.needsConnection')
      return
    }

    const chosen = saved[0]
    try {
      const result = await connectAndOpenCommunityPluginWorkbench(chosen.id, {
        title: options.title || chosen.name,
        intent: options.intent,
      })
      if (!result.ok) {
        error.value = resolveCaughtMessage(
          result.message,
          t,
          'communityPlugin.openWorkbenchFailed',
        )
        openConnectionFormForPlugin()
      }
    } catch (e) {
      error.value = caughtError(e, 'communityPlugin.openWorkbenchFailed')
      openConnectionFormForPlugin()
    }
  }

  function openSessionBoundFilesystem(contribution: {
    id?: string
    label?: string
    rootUri?: string
  }) {
    const workbench = contributions.value.find((c) => c.type === 'workbench')
    void launchPluginWorkbench({
      contributionId: workbench?.id,
      title: contributionLabel(workbench || contribution),
      intent: {
        action: 'reveal-files',
        uri: contribution.rootUri || undefined,
      },
    })
  }

  function openFilesystem(contribution: {
    id?: string
    label?: string
    rootUri?: string
    schemes?: string[]
    sessionBound?: boolean
    openTarget?: string
  }) {
    if (!selectedId.value || !contribution.id) return
    if (isSessionBoundFilesystemContribution(contribution)) {
      openSessionBoundFilesystem(contribution)
      return
    }
    workspace.openCommunityFilesystem(
      selectedId.value,
      contribution.id,
      contribution.rootUri,
      contributionLabel(contribution),
    )
  }

  function openConnectionProvider(contribution: {id?: string; label?: string}) {
    if (!selectedId.value || !contribution.id) return
    workspace.openConnectionForm('plugin', {
      pluginId: selectedId.value,
      pluginConnectionProvider: contribution.id,
      connectionName: contributionLabel(contribution),
    })
  }

  function editPluginConnection(connection: ConnectionConfig) {
    if (!selectedId.value || !connection.id) return
    workspace.openConnectionForm('plugin', {
      connectionId: connection.id,
      connectionName: connection.name || connection.id,
      pluginId: selectedId.value,
      pluginConnectionProvider: connection.pluginConnectionProvider,
    })
  }

  function applyPendingIntents() {
    const pluginId = ui.consumeSelectPluginId()
    if (pluginId) selectInstalled(pluginId)
    if (ui.consumeOpenSettings()) settingsOpen.value = true
  }

  onMounted(() => {
    window.addEventListener('dw-community-plugin-changed', onCommunityPluginChanged)
    void refresh().then(applyPendingIntents)
  })

  watch(allowUnsigned, (value) => {
    persistAllowUnsigned(value)
  })

  watch(
    () => [ui.pendingSelectPluginId, ui.pendingOpenSettings] as const,
    () => applyPendingIntents(),
  )

  watch(selectedId, (pluginId) => {
    void refreshPluginConnections(pluginId)
  })

  onUnmounted(() => {
    window.removeEventListener('dw-community-plugin-changed', onCommunityPluginChanged)
  })

  return {
    t,
    te,
    confirmOpen,
    confirmTitle,
    confirmMessage,
    confirmLabel,
    confirmVariant,
    onConfirmDialog,
    onConfirmOpenUpdate,
    plugins,
    catalogs,
    trustKeys,
    repositories,
    trustKeyDraft,
    repoDraft,
    savingTrust,
    savingRepos,
    loading,
    error,
    selectedId,
    selectedStoreKey,
    searchQuery,
    settingsOpen,
    installMenuOpen,
    installPath,
    installUrl,
    allowUnsigned,
    installing,
    installingCatalogKey,
    fileInputRef,
    selected,
    selectedStoreItem,
    catalogFetchErrors,
    marketplaceEntries,
    filteredInstalled,
    filteredStore,
    contributions,
    pluginConnections,
    catalogSourceLabel,
    pluginName,
    pluginListTitle,
    pluginListMeta,
    pluginDescription,
    contributionLabel,
    contributionDescription,
    contributionTypeLabel,
    storeEntryName,
    storeEntryDescription,
    selectInstalled,
    selectStoreItem,
    refresh,
    installFromPath,
    installFromUrl,
    installFromCatalog,
    installWarnings,
    installFromFile,
    addTrustKey,
    removeTrustKey,
    addRepository,
    removeRepository,
    onPickFile,
    onDragOver,
    onDropFile,
    uninstallSelected,
    rollbackSelected,
    openWorkbench,
    openFilesystem,
    openConnectionProvider,
    editPluginConnection,
  }
}
