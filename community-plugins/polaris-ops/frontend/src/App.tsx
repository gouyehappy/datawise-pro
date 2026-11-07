import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppRail, RAIL_ICONS } from './components/AppRail'
import { ConfigsPanel } from './components/ConfigsPanel'
import type { TreeChild } from './components/NamespaceTree'
import { OverviewPanel } from './components/OverviewPanel'
import { ServicesPanel } from './components/ServicesPanel'
import { writeClipboardText } from './bridge'
import { useFlash } from './hooks/useFlash'
import { useHostBridge } from './hooks/useHostBridge'
import { useConfirm } from './lib/confirm'
import { createI18n } from './lib/i18n'
import { buildNamespaceOptions, nsTreeKey, pickDefaultNamespace } from './lib/ns'
import {
  errMessage,
  isOpenTabDirty,
  newDraftTabId,
  openConfigId,
  suggestCopyDataId,
  type CheckedConfig,
  type ConfigDetail,
  type ConfigHistoryRow,
  type ConfigRow,
  type InstanceRow,
  type Ns,
  type OpenConfigTab,
  type PolarisInfo,
  type ServiceRow,
  type Tab,
} from './lib/types'

export function App() {
  const askConfirm = useConfirm()
  const { bridge, locale, connectionId, bootError, invoke } = useHostBridge()
  const { toast, flash } = useFlash()
  const [tab, setTab] = useState<Tab>('configs')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const openTabsRef = useRef<OpenConfigTab[]>([])
  const inflightConfigs = useRef(new Map<string, Promise<ConfigRow[]>>())

  const [info, setInfo] = useState<PolarisInfo | null>(null)
  const [namespaces, setNamespaces] = useState<Ns[]>([])
  const [ns, setNs] = useState('')
  const [nsReady, setNsReady] = useState(false)
  const nsReadyRef = useRef(false)

  const [configs, setConfigs] = useState<ConfigRow[]>([])
  const [configsTotal, setConfigsTotal] = useState(0)
  const [configsTruncated, setConfigsTruncated] = useState(false)
  const [configsLoading, setConfigsLoading] = useState(false)
  const [openTabs, setOpenTabs] = useState<OpenConfigTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [services, setServices] = useState<ServiceRow[]>([])
  const [servicesTotal, setServicesTotal] = useState(0)
  const [servicesTruncated, setServicesTruncated] = useState(false)
  const [servicesLoading, setServicesLoading] = useState(false)
  const [selectedService, setSelectedService] = useState<ServiceRow | null>(null)
  const [instances, setInstances] = useState<InstanceRow[]>([])
  const [instancesLoading, setInstancesLoading] = useState(false)

  const [configExpanded, setConfigExpanded] = useState<Record<string, boolean>>({})
  const [configChildren, setConfigChildren] = useState<Record<string, TreeChild[]>>({})
  const [configLoadingNs, setConfigLoadingNs] = useState<Record<string, boolean>>({})

  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyRows, setHistoryRows] = useState<ConfigHistoryRow[]>([])
  const [historySelected, setHistorySelected] = useState<ConfigHistoryRow | null>(null)

  const t = useMemo(() => createI18n(locale), [locale])
  const readOnly = Boolean(info?.readOnly)
  const nsOptions = useMemo(
    () => buildNamespaceOptions(namespaces, t('allNs')),
    [namespaces, t],
  )

  const activeTab = useMemo(
    () => openTabs.find((x) => x.id === activeTabId) || null,
    [openTabs, activeTabId],
  )
  const selected = activeTab?.detail ?? null
  const editing = Boolean(activeTab?.editing)
  const draft = activeTab?.draft ?? ''
  const draftFormat = activeTab?.draftFormat ?? 'text'
  const detailLoading = Boolean(activeTab?.loading)
  const isDirty = activeTab ? isOpenTabDirty(activeTab) : false

  const patchActiveTab = useCallback((patch: Partial<OpenConfigTab>) => {
    setOpenTabs((tabs) =>
      tabs.map((x) => (x.id === activeTabId ? { ...x, ...patch } : x)),
    )
  }, [activeTabId])

  openTabsRef.current = openTabs

  useEffect(() => {
    if (bootError) setError(bootError)
  }, [bootError])

  useEffect(() => {
    setHistoryOpen(false)
    setHistoryRows([])
    setHistorySelected(null)
  }, [activeTabId])

  const reloadNamespaces = useCallback(async () => {
    const nsRes = (await invoke('polaris/namespaces')) as { namespaces: Ns[] }
    const list = nsRes.namespaces || []
    setNamespaces(list)
    return list
  }, [invoke])

  const loadBootstrap = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const [infoRes, nsRes] = await Promise.all([
        invoke('polaris/info') as Promise<PolarisInfo>,
        invoke('polaris/namespaces') as Promise<{ namespaces: Ns[] }>,
      ])
      setInfo(infoRes)
      const list = nsRes.namespaces || []
      setNamespaces(list)
      setNs((cur) => (nsReadyRef.current ? cur : pickDefaultNamespace(list)))
      nsReadyRef.current = true
      setNsReady(true)
    } catch (e) {
      setError(errMessage(e))
    } finally {
      setBusy(false)
    }
  }, [invoke])

  const closeConfigTab = useCallback(
    async (id: string, opts?: { force?: boolean }) => {
      const target = openTabsRef.current.find((x) => x.id === id)
      if (!target) return
      if (!opts?.force && isOpenTabDirty(target)) {
        const ok = await askConfirm({
          title: t('unsavedTitle'),
          message: t('confirmDiscard'),
          confirmLabel: t('discard'),
          cancelLabel: t('cancel'),
          danger: true,
        })
        if (!ok) return
      }
      setOpenTabs((tabs) => {
        const idx = tabs.findIndex((x) => x.id === id)
        if (idx < 0) return tabs
        const next = tabs.filter((x) => x.id !== id)
        setActiveTabId((cur) => {
          if (cur !== id) return cur
          if (next.length === 0) return null
          return (next[Math.min(idx, next.length - 1)] || next[0])?.id ?? null
        })
        return next
      })
    },
    [askConfirm, t],
  )

  const closeOtherTabs = useCallback(
    async (keepId: string) => {
      const ids = openTabsRef.current.filter((x) => x.id !== keepId).map((x) => x.id)
      for (const id of ids) await closeConfigTab(id)
    },
    [closeConfigTab],
  )

  const closeTabsToRight = useCallback(
    async (id: string) => {
      const tabs = openTabsRef.current
      const idx = tabs.findIndex((x) => x.id === id)
      if (idx < 0) return
      for (const x of tabs.slice(idx + 1)) await closeConfigTab(x.id)
    },
    [closeConfigTab],
  )

  const closeAllTabs = useCallback(async () => {
    for (const x of [...openTabsRef.current]) await closeConfigTab(x.id)
  }, [closeConfigTab])

  const copyText = useCallback(
    async (text: string) => {
      const value = String(text || '')
      if (!value) return
      try {
        await writeClipboardText(bridge, value)
        flash(t('copied'))
      } catch {
        /* clipboard may be unavailable in restricted hosts */
      }
    },
    [bridge, flash, t],
  )

  const loadConfigsForNs = useCallback(
    async (targetNs: string, opts?: { silent?: boolean }) => {
      const key = nsTreeKey(targetNs)
      const existing = inflightConfigs.current.get(key)
      if (existing) return existing

      const task = (async () => {
        if (!opts?.silent) {
          setConfigsLoading(true)
          setConfigLoadingNs((m) => ({ ...m, [key]: true }))
        } else {
          setConfigLoadingNs((m) => ({ ...m, [key]: true }))
        }
        setError('')
        try {
          const res = (await invoke('polaris/configs/list', {
            namespace: targetNs || undefined,
            limit: 200,
          })) as { configs: ConfigRow[]; totalCount?: number; truncated?: boolean }
          const list = res.configs || []
          const total = res.totalCount ?? list.length
          setConfigChildren((m) => ({
            ...m,
            [key]: list.map((row) => ({ kind: 'config' as const, row })),
          }))
          if (nsTreeKey(targetNs) === nsTreeKey(ns)) {
            setConfigs(list)
            setConfigsTotal(total)
            setConfigsTruncated(Boolean(res.truncated) || total > list.length)
          }
          return list
        } catch (e) {
          setError(errMessage(e))
          return [] as ConfigRow[]
        } finally {
          setConfigsLoading(false)
          setConfigLoadingNs((m) => ({ ...m, [key]: false }))
          inflightConfigs.current.delete(key)
        }
      })()

      inflightConfigs.current.set(key, task)
      return task
    },
    [invoke, ns],
  )

  const loadConfigs = useCallback(async () => {
    await loadConfigsForNs(ns)
  }, [loadConfigsForNs, ns])

  const openConfig = useCallback(
    async (row: ConfigRow, namespaceOverride?: string) => {
      const targetNs = String(namespaceOverride ?? row.namespace ?? ns)
      const id = openConfigId(row, targetNs)
      if (targetNs !== ns) setNs(targetNs)

      let alreadyOpen = false
      setOpenTabs((tabs) => {
        if (tabs.some((x) => x.id === id)) {
          alreadyOpen = true
          return tabs
        }
        const format = row.format || 'text'
        return [
          ...tabs,
          {
            id,
            namespace: targetNs,
            detail: {
              ...row,
              namespace: targetNs,
              format,
              content: '',
            },
            draft: '',
            draftFormat: format,
            editing: false,
            loading: true,
          },
        ]
      })
      setActiveTabId(id)
      if (alreadyOpen) return

      setError('')
      try {
        const detail = (await invoke('polaris/configs/get', {
          name: row.name,
          group: row.group,
          namespace: targetNs,
        })) as ConfigDetail
        const merged: ConfigDetail = {
          ...row,
          ...detail,
          namespace: targetNs,
          content: detail.content ?? '',
        }
        setOpenTabs((tabs) =>
          tabs.map((x) =>
            x.id === id
              ? {
                  ...x,
                  detail: merged,
                  draft: merged.content,
                  draftFormat: merged.format || row.format || 'text',
                  editing: false,
                  loading: false,
                }
              : x,
          ),
        )
      } catch (e) {
        setError(errMessage(e))
        setOpenTabs((tabs) => {
          const next = tabs.filter((x) => x.id !== id)
          setActiveTabId((cur) => {
            if (cur !== id) return cur
            return next[next.length - 1]?.id ?? null
          })
          return next
        })
      }
    },
    [invoke, ns],
  )

  const toggleConfigNs = useCallback(
    async (id: string) => {
      const key = nsTreeKey(id)
      const nextOpen = !configExpanded[key]
      setConfigExpanded((m) => ({ ...m, [key]: nextOpen }))
      if (nextOpen && !configChildren[key]) {
        await loadConfigsForNs(id, { silent: true })
      }
      if (nextOpen) setNs(id)
    },
    [configExpanded, configChildren, loadConfigsForNs],
  )

  const beginCreate = useCallback(
    (targetNs?: string) => {
      if (readOnly) return
      const nextNs = targetNs !== undefined ? String(targetNs) : ns
      if (targetNs !== undefined) {
        setNs(nextNs)
        setConfigExpanded((m) => ({ ...m, [nsTreeKey(nextNs)]: true }))
      }
      const id = newDraftTabId()
      const draftTab: OpenConfigTab = {
        id,
        namespace: nextNs,
        isNew: true,
        detail: {
          name: '',
          group: 'DEFAULT',
          format: 'text',
          namespace: nextNs,
          content: '',
        },
        draft: '',
        draftFormat: 'text',
        editing: true,
      }
      setOpenTabs((tabs) => [...tabs, draftTab])
      setActiveTabId(id)
    },
    [readOnly, ns],
  )

  const pushDraftTab = useCallback(
    (input: {
      namespace: string
      name: string
      group: string
      format: string
      content: string
    }) => {
      const id = newDraftTabId()
      const draftTab: OpenConfigTab = {
        id,
        namespace: input.namespace,
        isNew: true,
        detail: {
          name: input.name,
          group: input.group || 'DEFAULT',
          format: input.format || 'text',
          namespace: input.namespace,
          content: '',
        },
        draft: input.content || '',
        draftFormat: input.format || 'text',
        editing: true,
      }
      setOpenTabs((tabs) => [...tabs, draftTab])
      setActiveTabId(id)
      return id
    },
    [],
  )

  const cloneActive = useCallback(() => {
    if (!activeTab || !selected || activeTab.isNew || readOnly) return
    pushDraftTab({
      namespace: activeTab.namespace,
      name: suggestCopyDataId(selected.name),
      group: selected.group || 'DEFAULT',
      format: activeTab.editing ? draftFormat : selected.format || 'text',
      content: activeTab.editing ? draft : selected.content || '',
    })
    flash(t('cloned'))
  }, [activeTab, selected, readOnly, pushDraftTab, draft, draftFormat, flash, t])

  const saveOrUpdateConfig = useCallback(async () => {
    if (!activeTab || !selected || readOnly) return

    if (activeTab.isNew) {
      const name = (selected.name || '').trim()
      if (!name) {
        setError(t('requiredName'))
        return
      }
      const group = (selected.group || '').trim() || 'DEFAULT'
      setSaving(true)
      setError('')
      try {
        const detail = (await invoke('polaris/configs/create', {
          name,
          group,
          namespace: activeTab.namespace,
          content: draft,
          format: draftFormat,
        })) as ConfigDetail & { released?: boolean; releaseSkipped?: boolean }
        const merged: ConfigDetail = {
          name,
          group,
          format: draftFormat,
          namespace: activeTab.namespace,
          content: detail.content ?? draft,
          md5: detail.md5,
        }
        const nextId = openConfigId(merged, activeTab.namespace)
        const oldId = activeTab.id
        setOpenTabs((tabs) => {
          const converted: OpenConfigTab = {
            id: nextId,
            namespace: activeTab.namespace,
            detail: merged,
            draft: merged.content,
            draftFormat,
            editing: false,
          }
          const without = tabs.filter((x) => x.id !== oldId && x.id !== nextId)
          return [...without, converted]
        })
        setActiveTabId(nextId)
        flash(
          detail.releaseSkipped || detail.released === false ? t('updatedOnly') : t('created'),
        )
        await loadConfigsForNs(activeTab.namespace, { silent: true })
      } catch (e) {
        setError(errMessage(e))
      } finally {
        setSaving(false)
      }
      return
    }

    setSaving(true)
    setError('')
    try {
      const detail = (await invoke('polaris/configs/update', {
        name: selected.name,
        group: selected.group,
        namespace: activeTab.namespace,
        content: draft,
        format: draftFormat,
      })) as ConfigDetail & { released?: boolean; releaseSkipped?: boolean }
      const merged = {
        ...selected,
        ...detail,
        namespace: activeTab.namespace,
        content: detail.content ?? draft,
        format: draftFormat,
      }
      patchActiveTab({
        detail: merged,
        draft: merged.content,
        draftFormat,
        editing: false,
      })
      flash(detail.releaseSkipped || detail.released === false ? t('updatedOnly') : t('updated'))
      await loadConfigsForNs(activeTab.namespace, { silent: true })
    } catch (e) {
      setError(errMessage(e))
    } finally {
      setSaving(false)
    }
  }, [activeTab, selected, readOnly, invoke, draft, draftFormat, patchActiveTab, flash, t, loadConfigsForNs])

  const deleteConfig = useCallback(async () => {
    if (!activeTab || !selected || readOnly || activeTab.isNew) return
    const ok = await askConfirm({
      title: t('delete'),
      message: t('confirmDelete'),
      confirmLabel: t('delete'),
      cancelLabel: t('cancel'),
      danger: true,
    })
    if (!ok) return
    setSaving(true)
    setError('')
    try {
      await invoke('polaris/configs/delete', {
        name: selected.name,
        group: selected.group,
        namespace: activeTab.namespace,
      })
      closeConfigTab(activeTab.id, { force: true })
      flash(t('deleted'))
      await loadConfigsForNs(activeTab.namespace, { silent: true })
    } catch (e) {
      setError(errMessage(e))
    } finally {
      setSaving(false)
    }
  }, [activeTab, selected, readOnly, t, askConfirm, invoke, closeConfigTab, flash, loadConfigsForNs])

  const batchDeleteConfigs = useCallback(
    async (items: CheckedConfig[]) => {
      if (readOnly || items.length === 0) return
      const ok = await askConfirm({
        title: t('batchDelete'),
        message: t('confirmBatchDelete', { count: items.length }),
        confirmLabel: t('delete'),
        cancelLabel: t('cancel'),
        danger: true,
      })
      if (!ok) return
      setSaving(true)
      setError('')
      let done = 0
      const deletedKeys = new Set<string>()
      try {
        for (const item of items) {
          await invoke('polaris/configs/delete', {
            name: item.row.name,
            group: item.row.group,
            namespace: item.namespaceId,
          })
          deletedKeys.add(item.key)
          done += 1
        }
        setOpenTabs((tabs) => {
          const next = tabs.filter((x) => !deletedKeys.has(x.id))
          setActiveTabId((cur) => {
            if (cur && deletedKeys.has(cur)) return next[next.length - 1]?.id ?? null
            return cur
          })
          return next
        })
        flash(t('batchDeleted', { count: done }))
        const nss = [...new Set(items.map((i) => i.namespaceId))]
        for (const n of nss) {
          await loadConfigsForNs(n, { silent: true })
        }
      } catch (e) {
        setError(errMessage(e))
        if (done > 0) flash(t('batchDeleted', { count: done }))
      } finally {
        setSaving(false)
      }
    },
    [readOnly, askConfirm, t, invoke, flash, loadConfigsForNs],
  )

  const batchCloneConfigs = useCallback(
    async (items: CheckedConfig[]) => {
      if (readOnly || items.length === 0) return
      setSaving(true)
      setError('')
      try {
        for (const item of items) {
          const detail = (await invoke('polaris/configs/get', {
            name: item.row.name,
            group: item.row.group,
            namespace: item.namespaceId,
          })) as ConfigDetail
          pushDraftTab({
            namespace: item.namespaceId,
            name: suggestCopyDataId(item.row.name),
            group: item.row.group || 'DEFAULT',
            format: detail.format || item.row.format || 'text',
            content: detail.content ?? '',
          })
        }
        flash(t('cloned'))
      } catch (e) {
        setError(errMessage(e))
      } finally {
        setSaving(false)
      }
    },
    [readOnly, invoke, pushDraftTab, flash, t],
  )

  const batchOpenConfigs = useCallback(
    async (items: CheckedConfig[]) => {
      for (const item of items) {
        await openConfig(item.row, item.namespaceId)
      }
    },
    [openConfig],
  )

  const createNamespace = useCallback(async () => {
    if (readOnly) return
    const name = window.prompt(t('nsNamePlaceholder'), '')
    if (name === null) return
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t('requiredNsName'))
      return
    }
    const comment = window.prompt(t('nsCommentPlaceholder'), '') ?? ''
    setSaving(true)
    setError('')
    try {
      await invoke('polaris/namespaces/create', { name: trimmed, comment })
      flash(t('nsCreated'))
      await reloadNamespaces()
      setNs(trimmed)
      setConfigExpanded((m) => ({ ...m, [nsTreeKey(trimmed)]: true }))
    } catch (e) {
      setError(errMessage(e))
    } finally {
      setSaving(false)
    }
  }, [readOnly, t, invoke, flash, reloadNamespaces])

  const deleteNamespace = useCallback(
    async (name: string) => {
      if (readOnly || !name) return
      const ok = await askConfirm({
        title: t('deleteNamespace'),
        message: t('confirmDeleteNs', { name }),
        confirmLabel: t('delete'),
        cancelLabel: t('cancel'),
        danger: true,
      })
      if (!ok) return
      setSaving(true)
      setError('')
      try {
        await invoke('polaris/namespaces/delete', { name })
        flash(t('nsDeleted'))
        setOpenTabs((tabs) => {
          const next = tabs.filter((x) => x.namespace !== name)
          setActiveTabId((cur) => {
            if (cur && tabs.some((x) => x.id === cur && x.namespace === name)) {
              return next[next.length - 1]?.id ?? null
            }
            return cur
          })
          return next
        })
        setConfigChildren((m) => {
          const next = { ...m }
          delete next[nsTreeKey(name)]
          return next
        })
        const list = await reloadNamespaces()
        if (ns === name) {
          setNs(pickDefaultNamespace(list))
        }
      } catch (e) {
        setError(errMessage(e))
      } finally {
        setSaving(false)
      }
    },
    [readOnly, askConfirm, t, invoke, flash, reloadNamespaces, ns],
  )

  const closeHistory = useCallback(() => {
    setHistoryOpen(false)
    setHistorySelected(null)
  }, [])

  const toggleHistory = useCallback(async () => {
    if (!activeTab || !selected || activeTab.isNew) return
    if (historyOpen) {
      closeHistory()
      return
    }
    setHistoryOpen(true)
    setHistorySelected(null)
    setHistoryLoading(true)
    setError('')
    try {
      const res = (await invoke('polaris/configs/history', {
        name: selected.name,
        group: selected.group,
        namespace: activeTab.namespace,
        limit: 30,
      })) as { histories?: ConfigHistoryRow[] }
      const list = res.histories || []
      setHistoryRows(list)
      const firstWithContent = list.find((r) => (r.content ?? '') !== '')
      if (firstWithContent) setHistorySelected(firstWithContent)
    } catch (e) {
      setError(errMessage(e))
      setHistoryRows([])
    } finally {
      setHistoryLoading(false)
    }
  }, [activeTab, selected, historyOpen, invoke, closeHistory])

  const selectHistory = useCallback(
    (row: ConfigHistoryRow) => {
      if (row.content == null) {
        setError(t('historyNoContent'))
        return
      }
      setError('')
      setHistorySelected(row)
    },
    [t],
  )

  const restoreHistory = useCallback(
    (row: ConfigHistoryRow) => {
      if (readOnly || !selected) return
      if (row.content == null) {
        setError(t('historyNoContent'))
        return
      }
      patchActiveTab({
        editing: true,
        draft: row.content,
        draftFormat: row.format || selected.format || 'text',
      })
      closeHistory()
      flash(t('historyRestored'))
    },
    [readOnly, selected, patchActiveTab, flash, t, closeHistory],
  )

  const loadServices = useCallback(async () => {
    setServicesLoading(true)
    setSelectedService(null)
    setInstances([])
    setError('')
    try {
      const res = (await invoke('polaris/services/list', {
        namespace: ns || undefined,
        limit: 200,
      })) as { services: ServiceRow[]; totalCount?: number; truncated?: boolean }
      const list = res.services || []
      const total = res.totalCount ?? list.length
      setServices(list)
      setServicesTotal(total)
      setServicesTruncated(Boolean(res.truncated) || total > list.length)
    } catch (e) {
      setError(errMessage(e))
    } finally {
      setServicesLoading(false)
    }
  }, [invoke, ns])

  const openService = useCallback(
    async (row: ServiceRow) => {
      const targetNs = String(row.namespace || ns)
      setSelectedService({ ...row, namespace: targetNs || row.namespace })
      setInstancesLoading(true)
      setError('')
      try {
        const res = (await invoke('polaris/instances/list', {
          namespace: targetNs || undefined,
          service: row.name,
          limit: 200,
        })) as { instances: InstanceRow[] }
        setInstances(res.instances || [])
      } catch (e) {
        setError(errMessage(e))
      } finally {
        setInstancesLoading(false)
      }
    },
    [invoke, ns],
  )

  const changeNs = useCallback((next: string) => {
    setNs(next)
  }, [])

  const refreshActive = useCallback(async () => {
    await loadBootstrap()
    if (tab === 'configs') await loadConfigs()
    if (tab === 'services') await loadServices()
  }, [loadBootstrap, tab, loadConfigs, loadServices])

  useEffect(() => {
    if (!bridge || !connectionId) return
    void loadBootstrap()
  }, [bridge, connectionId, loadBootstrap])

  useEffect(() => {
    if (!bridge || !connectionId || !nsReady) return
    if (tab === 'configs') void loadConfigsForNs(ns)
    if (tab === 'services') void loadServices()
  }, [bridge, connectionId, nsReady, ns, tab, loadConfigsForNs, loadServices])

  const statusLine = [
    info?.baseUrl || '',
    readOnly ? t('readOnly') : '',
    ns ? `ns:${ns}` : t('allNs'),
  ]
    .filter(Boolean)
    .join(' · ')

  const railItems = useMemo(
    () =>
      ([
        ['overview', t('overview')],
        ['configs', t('configs')],
        ['services', t('services')],
      ] as const).map(([id, label]) => ({
        id: id as Tab,
        label,
        icon: RAIL_ICONS[id],
      })),
    [t],
  )

  return (
    <div className="shell">
      <AppRail
        title={t('title')}
        active={tab}
        items={railItems}
        readOnly={readOnly}
        readOnlyLabel={t('readOnly')}
        baseUrl={info?.baseUrl || ''}
        onNavigate={setTab}
      />

      <div className="main">
        <header className="topbar">
          <div className="topbar__meta">{statusLine}</div>
          <span className="grow" />
          <button
            className="btn"
            type="button"
            disabled={busy || configsLoading || servicesLoading}
            onClick={() => void refreshActive()}
          >
            {t('refresh')}
          </button>
        </header>

        {error ? (
          <div className="banners">
            <div className="banner error">{error}</div>
          </div>
        ) : null}

        <div className="content">
          {tab === 'overview' ? (
            <OverviewPanel
              info={info}
              namespaces={namespaces}
              t={t}
              onOpen={(next, nextNs) => {
                if (nextNs !== undefined) setNs(nextNs)
                setTab(next)
              }}
            />
          ) : null}

          {tab === 'configs' ? (
            <ConfigsPanel
              nsId={ns}
              nsOptions={nsOptions}
              readOnly={readOnly}
              configs={configs}
              totalCount={configsTotal}
              truncated={configsTruncated}
              loading={configsLoading}
              detailLoading={detailLoading}
              openTabs={openTabs}
              activeTabId={activeTabId}
              isNew={Boolean(activeTab?.isNew)}
              selected={selected}
              draft={draft}
              draftFormat={draftFormat}
              editing={editing}
              saving={saving}
              expanded={configExpanded}
              childrenByNs={configChildren}
              loadingNs={configLoadingNs}
              historyOpen={historyOpen}
              historyLoading={historyLoading}
              historyRows={historyRows}
              historySelected={historySelected}
              isDirty={isDirty}
              t={t}
              onNsChange={changeNs}
              onToggleNs={(id) => void toggleConfigNs(id)}
              onRefresh={() => void loadConfigs()}
              onSelect={(row) => void openConfig(row, row.namespace ?? ns)}
              onActivateTab={setActiveTabId}
              onCloseTab={(id) => void closeConfigTab(id)}
              onCloseOtherTabs={(id) => void closeOtherTabs(id)}
              onCloseTabsRight={(id) => void closeTabsToRight(id)}
              onCloseAllTabs={() => void closeAllTabs()}
              onDraft={(v) => patchActiveTab({ draft: v })}
              onDraftFormat={(v) => patchActiveTab({ draftFormat: v })}
              onMetaChange={(meta) => {
                if (!selected) return
                patchActiveTab({
                  detail: {
                    ...selected,
                    ...(meta.name !== undefined ? { name: meta.name } : {}),
                    ...(meta.group !== undefined ? { group: meta.group } : {}),
                  },
                })
              }}
              onStartEdit={() => {
                if (!selected) return
                patchActiveTab({
                  editing: true,
                  draft: selected.content || '',
                  draftFormat: selected.format || 'text',
                })
              }}
              onDiscard={() => {
                void (async () => {
                  if (!selected || !activeTab) return
                  if (activeTab.isNew) {
                    void closeConfigTab(activeTab.id)
                    return
                  }
                  if (isDirty) {
                    const ok = await askConfirm({
                      title: t('unsavedTitle'),
                      message: t('confirmDiscard'),
                      confirmLabel: t('discard'),
                      cancelLabel: t('cancel'),
                      danger: true,
                    })
                    if (!ok) return
                  }
                  patchActiveTab({
                    editing: false,
                    draft: selected.content || '',
                    draftFormat: selected.format || 'text',
                  })
                })()
              }}
              onUpdate={() => void saveOrUpdateConfig()}
              onDelete={() => void deleteConfig()}
              onClone={cloneActive}
              onBeginCreate={beginCreate}
              onRefreshNs={(id) => void loadConfigsForNs(id, { silent: true })}
              onCloneConfig={(namespaceId, row) =>
                void batchCloneConfigs([{ key: openConfigId(row, namespaceId), namespaceId, row }])
              }
              onDeleteConfig={(namespaceId, row) =>
                void batchDeleteConfigs([{ key: openConfigId(row, namespaceId), namespaceId, row }])
              }
              onCreateNamespace={() => void createNamespace()}
              onDeleteNamespace={(name) => void deleteNamespace(name)}
              onCopyText={(text) => void copyText(text)}
              onBatchOpen={(items) => void batchOpenConfigs(items)}
              onBatchClone={(items) => void batchCloneConfigs(items)}
              onBatchDelete={(items) => void batchDeleteConfigs(items)}
              onToggleHistory={() => void toggleHistory()}
              onCloseHistory={closeHistory}
              onSelectHistory={selectHistory}
              onRestoreHistory={restoreHistory}
            />
          ) : null}

          {tab === 'services' ? (
            <ServicesPanel
              nsId={ns}
              nsOptions={nsOptions}
              services={services}
              totalCount={servicesTotal}
              truncated={servicesTruncated}
              loading={servicesLoading}
              instancesLoading={instancesLoading}
              selected={selectedService}
              instances={instances}
              t={t}
              onNsChange={changeNs}
              onRefresh={() => void loadServices()}
              onSelect={(row) => void openService(row)}
            />
          ) : null}
        </div>

        <footer className="footer">
          {busy || configsLoading || servicesLoading ? t('loading') : statusLine}
        </footer>
      </div>

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  )
}
