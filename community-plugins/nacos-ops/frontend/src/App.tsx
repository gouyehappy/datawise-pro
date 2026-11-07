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
import {
  buildNamespaceOptions,
  normalizeNamespaceId,
  nsTreeKey,
  pickDefaultNamespace,
} from './lib/ns'
import {
  errMessage,
  historyRowKey,
  isOpenTabDirty,
  newDraftTabId,
  openConfigId,
  suggestCopyDataId,
  type CheckedConfig,
  type ConfigDetail,
  type ConfigHistoryRow,
  type ConfigRow,
  type InstanceRow,
  type NacosInfo,
  type Ns,
  type OpenConfigTab,
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

  const [info, setInfo] = useState<NacosInfo | null>(null)
  const [namespaces, setNamespaces] = useState<Ns[]>([])
  const [nsId, setNsId] = useState('')
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
    () => buildNamespaceOptions(namespaces, t('publicNs')),
    [namespaces, t],
  )

  const activeTab = useMemo(
    () => openTabs.find((tab) => tab.id === activeTabId) || null,
    [openTabs, activeTabId],
  )
  const selected = activeTab?.detail ?? null
  const editing = Boolean(activeTab?.editing)
  const draft = activeTab?.draft ?? ''
  const draftType = activeTab?.draftType ?? 'text'
  const detailLoading = Boolean(activeTab?.loading)
  const isDirty = activeTab ? isOpenTabDirty(activeTab) : false

  const patchActiveTab = useCallback((patch: Partial<OpenConfigTab>) => {
    setOpenTabs((tabs) =>
      tabs.map((tab) => (tab.id === activeTabId ? { ...tab, ...patch } : tab)),
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
    const nsRes = (await invoke('nacos/namespaces')) as { namespaces: Ns[] }
    const list = (nsRes.namespaces || []).map((n) => ({
      ...n,
      id: normalizeNamespaceId(n.id),
    }))
    setNamespaces(list)
    return list
  }, [invoke])

  const loadBootstrap = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const [infoRes, list] = await Promise.all([
        invoke('nacos/info') as Promise<NacosInfo>,
        reloadNamespaces(),
      ])
      setInfo(infoRes)
      setNsId((cur) =>
        nsReadyRef.current ? cur : pickDefaultNamespace(list, infoRes.defaultNamespace),
      )
      nsReadyRef.current = true
      setNsReady(true)
    } catch (e) {
      setError(errMessage(e))
    } finally {
      setBusy(false)
    }
  }, [invoke, reloadNamespaces])

  const closeConfigTab = useCallback(
    async (id: string, opts?: { force?: boolean }) => {
      const target = openTabsRef.current.find((tab) => tab.id === id)
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
        const idx = tabs.findIndex((tab) => tab.id === id)
        if (idx < 0) return tabs
        const next = tabs.filter((tab) => tab.id !== id)
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
      const ids = openTabsRef.current.filter((tab) => tab.id !== keepId).map((tab) => tab.id)
      for (const id of ids) await closeConfigTab(id)
    },
    [closeConfigTab],
  )

  const closeTabsToRight = useCallback(
    async (id: string) => {
      const tabs = openTabsRef.current
      const idx = tabs.findIndex((tab) => tab.id === id)
      if (idx < 0) return
      for (const tab of tabs.slice(idx + 1)) await closeConfigTab(tab.id)
    },
    [closeConfigTab],
  )

  const closeAllTabs = useCallback(async () => {
    for (const tab of [...openTabsRef.current]) await closeConfigTab(tab.id)
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
          const res = (await invoke('nacos/configs/list', {
            namespaceId: targetNs,
            pageSize: 200,
            pageNo: 1,
          })) as { configs: ConfigRow[]; totalCount?: number; truncated?: boolean }
          const list = res.configs || []
          setConfigChildren((m) => ({
            ...m,
            [key]: list.map((row) => ({ kind: 'config' as const, row })),
          }))
          if (normalizeNamespaceId(targetNs) === normalizeNamespaceId(nsId)) {
            setConfigs(list)
            setConfigsTotal(res.totalCount ?? list.length)
            setConfigsTruncated(Boolean(res.truncated))
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
    [invoke, nsId],
  )

  const loadConfigs = useCallback(async () => {
    await loadConfigsForNs(nsId)
  }, [loadConfigsForNs, nsId])

  const openConfig = useCallback(
    async (row: ConfigRow, namespaceOverride?: string) => {
      const targetNs = normalizeNamespaceId(namespaceOverride ?? row.tenant ?? nsId)
      const id = openConfigId(row, targetNs)
      if (targetNs !== normalizeNamespaceId(nsId)) {
        setNsId(targetNs)
      }

      let alreadyOpen = false
      setOpenTabs((tabs) => {
        if (tabs.some((tab) => tab.id === id)) {
          alreadyOpen = true
          return tabs
        }
        const type = row.type || 'text'
        return [
          ...tabs,
          {
            id,
            namespaceId: targetNs,
            detail: {
              ...row,
              tenant: targetNs,
              type,
              content: '',
            },
            draft: '',
            draftType: type,
            editing: false,
            loading: true,
          },
        ]
      })
      setActiveTabId(id)
      if (alreadyOpen) return

      setError('')
      try {
        const detail = (await invoke('nacos/configs/get', {
          dataId: row.dataId,
          group: row.group,
          namespaceId: targetNs,
        })) as ConfigDetail
        const merged: ConfigDetail = {
          ...row,
          ...detail,
          tenant: targetNs,
          content: detail.content ?? '',
        }
        setOpenTabs((tabs) =>
          tabs.map((tab) =>
            tab.id === id
              ? {
                  ...tab,
                  detail: merged,
                  draft: merged.content,
                  draftType: merged.type || row.type || 'text',
                  editing: false,
                  loading: false,
                }
              : tab,
          ),
        )
      } catch (e) {
        setError(errMessage(e))
        setOpenTabs((tabs) => {
          const next = tabs.filter((tab) => tab.id !== id)
          setActiveTabId((cur) => {
            if (cur !== id) return cur
            return next[next.length - 1]?.id ?? null
          })
          return next
        })
      }
    },
    [invoke, nsId],
  )

  const toggleConfigNs = useCallback(
    async (id: string) => {
      const key = nsTreeKey(id)
      const nextOpen = !configExpanded[key]
      setConfigExpanded((m) => ({ ...m, [key]: nextOpen }))
      if (nextOpen && !configChildren[key]) {
        await loadConfigsForNs(id, { silent: true })
      }
      if (nextOpen) setNsId(normalizeNamespaceId(id))
    },
    [configExpanded, configChildren, loadConfigsForNs],
  )

  const beginCreate = useCallback(
    (targetNs?: string) => {
      if (readOnly) return
      const ns = targetNs !== undefined ? normalizeNamespaceId(targetNs) : nsId
      if (targetNs !== undefined) {
        setNsId(ns)
        setConfigExpanded((m) => ({ ...m, [nsTreeKey(ns)]: true }))
      }
      const id = newDraftTabId()
      const tab: OpenConfigTab = {
        id,
        namespaceId: ns,
        isNew: true,
        detail: {
          dataId: '',
          group: 'DEFAULT_GROUP',
          type: 'text',
          tenant: ns,
          content: '',
        },
        draft: '',
        draftType: 'text',
        editing: true,
      }
      setOpenTabs((tabs) => [...tabs, tab])
      setActiveTabId(id)
    },
    [readOnly, nsId],
  )

  const pushDraftTab = useCallback(
    (input: {
      namespaceId: string
      dataId: string
      group: string
      type: string
      content: string
    }) => {
      const id = newDraftTabId()
      const tab: OpenConfigTab = {
        id,
        namespaceId: input.namespaceId,
        isNew: true,
        detail: {
          dataId: input.dataId,
          group: input.group || 'DEFAULT_GROUP',
          type: input.type || 'text',
          tenant: input.namespaceId,
          content: '',
        },
        draft: input.content || '',
        draftType: input.type || 'text',
        editing: true,
      }
      setOpenTabs((tabs) => [...tabs, tab])
      setActiveTabId(id)
      return id
    },
    [],
  )

  const cloneActive = useCallback(() => {
    if (!activeTab || !selected || activeTab.isNew || readOnly) return
    pushDraftTab({
      namespaceId: activeTab.namespaceId,
      dataId: suggestCopyDataId(selected.dataId),
      group: selected.group || 'DEFAULT_GROUP',
      type: activeTab.editing ? draftType : selected.type || 'text',
      content: activeTab.editing ? draft : selected.content || '',
    })
    flash(t('cloned'))
  }, [activeTab, selected, readOnly, pushDraftTab, draft, draftType, flash, t])

  const publishConfig = useCallback(async () => {
    if (!activeTab || !selected || readOnly) return

    if (activeTab.isNew) {
      const dataId = (selected.dataId || '').trim()
      if (!dataId) {
        setError(t('requiredDataId'))
        return
      }
      const group = (selected.group || '').trim() || 'DEFAULT_GROUP'
      setSaving(true)
      setError('')
      try {
        const detail = (await invoke('nacos/configs/publish', {
          dataId,
          group,
          namespaceId: activeTab.namespaceId,
          content: draft,
          type: draftType,
        })) as ConfigDetail
        const merged: ConfigDetail = {
          dataId,
          group,
          type: draftType,
          tenant: activeTab.namespaceId,
          content: detail.content ?? draft,
          md5: detail.md5,
        }
        const nextId = openConfigId(merged, activeTab.namespaceId)
        const oldId = activeTab.id
        setOpenTabs((tabs) => {
          const converted: OpenConfigTab = {
            id: nextId,
            namespaceId: activeTab.namespaceId,
            detail: merged,
            draft: merged.content,
            draftType: draftType,
            editing: false,
          }
          const without = tabs.filter((tab) => tab.id !== oldId && tab.id !== nextId)
          return [...without, converted]
        })
        setActiveTabId(nextId)
        flash(t('created'))
        await loadConfigsForNs(activeTab.namespaceId, { silent: true })
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
      const detail = (await invoke('nacos/configs/publish', {
        dataId: selected.dataId,
        group: selected.group,
        namespaceId: activeTab.namespaceId,
        content: draft,
        type: draftType,
      })) as ConfigDetail
      const merged = {
        ...selected,
        ...detail,
        tenant: activeTab.namespaceId,
        content: detail.content ?? draft,
        type: draftType,
      }
      patchActiveTab({
        detail: merged,
        draft: merged.content,
        draftType,
        editing: false,
      })
      flash(t('published'))
      await loadConfigsForNs(activeTab.namespaceId, { silent: true })
    } catch (e) {
      setError(errMessage(e))
    } finally {
      setSaving(false)
    }
  }, [activeTab, selected, readOnly, invoke, draft, draftType, patchActiveTab, flash, t, loadConfigsForNs])

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
      await invoke('nacos/configs/delete', {
        dataId: selected.dataId,
        group: selected.group,
        namespaceId: activeTab.namespaceId,
      })
      closeConfigTab(activeTab.id, { force: true })
      flash(t('deleted'))
      await loadConfigsForNs(activeTab.namespaceId, { silent: true })
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
          await invoke('nacos/configs/delete', {
            dataId: item.row.dataId,
            group: item.row.group,
            namespaceId: item.namespaceId,
          })
          deletedKeys.add(item.key)
          done += 1
        }
        setOpenTabs((tabs) => {
          const next = tabs.filter((tab) => !deletedKeys.has(tab.id))
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
          const detail = (await invoke('nacos/configs/get', {
            dataId: item.row.dataId,
            group: item.row.group,
            namespaceId: item.namespaceId,
          })) as ConfigDetail
          pushDraftTab({
            namespaceId: item.namespaceId,
            dataId: suggestCopyDataId(item.row.dataId),
            group: item.row.group || 'DEFAULT_GROUP',
            type: detail.type || item.row.type || 'text',
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

  const loadServices = useCallback(async () => {
    setServicesLoading(true)
    setSelectedService(null)
    setInstances([])
    setError('')
    try {
      const res = (await invoke('nacos/services/list', {
        namespaceId: nsId,
        pageSize: 200,
      })) as { services: ServiceRow[]; totalCount?: number; truncated?: boolean }
      const list = res.services || []
      setServices(list)
      setServicesTotal(res.totalCount ?? list.length)
      setServicesTruncated(Boolean(res.truncated))
    } catch (e) {
      setError(errMessage(e))
    } finally {
      setServicesLoading(false)
    }
  }, [invoke, nsId])

  const openService = useCallback(
    async (row: ServiceRow) => {
      setSelectedService(row)
      setInstancesLoading(true)
      setError('')
      try {
        const res = (await invoke('nacos/instances/list', {
          serviceName: row.name,
          groupName: row.groupName,
          namespaceId: nsId,
        })) as { instances: InstanceRow[] }
        setInstances(res.instances || [])
      } catch (e) {
        setError(errMessage(e))
      } finally {
        setInstancesLoading(false)
      }
    },
    [invoke, nsId],
  )

  const createNamespace = useCallback(async () => {
    if (readOnly) return
    const idRaw = window.prompt(t('nsIdPlaceholder'), '')
    if (idRaw === null) return
    const name = window.prompt(t('nsNamePlaceholder'), '')
    if (name === null) return
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t('requiredNsName'))
      return
    }
    const desc = window.prompt(t('nsDescPlaceholder'), '') ?? ''
    setSaving(true)
    setError('')
    try {
      const res = (await invoke('nacos/namespaces/create', {
        id: idRaw.trim(),
        name: trimmed,
        desc,
      })) as { id?: string }
      flash(t('nsCreated'))
      const list = await reloadNamespaces()
      const createdId = normalizeNamespaceId(res.id || idRaw.trim())
      if (createdId || list.some((n) => n.id === createdId)) {
        setNsId(createdId)
        setConfigExpanded((m) => ({ ...m, [nsTreeKey(createdId)]: true }))
      }
    } catch (e) {
      setError(errMessage(e))
    } finally {
      setSaving(false)
    }
  }, [readOnly, t, invoke, flash, reloadNamespaces])

  const deleteNamespace = useCallback(
    async (targetId: string) => {
      const id = normalizeNamespaceId(targetId)
      if (readOnly || !id) return
      const label = namespaces.find((n) => n.id === id)?.name || id
      const ok = await askConfirm({
        title: t('deleteNamespace'),
        message: t('confirmDeleteNs', { name: label }),
        confirmLabel: t('delete'),
        cancelLabel: t('cancel'),
        danger: true,
      })
      if (!ok) return
      setSaving(true)
      setError('')
      try {
        await invoke('nacos/namespaces/delete', { id })
        flash(t('nsDeleted'))
        setOpenTabs((tabs) => {
          const next = tabs.filter((x) => normalizeNamespaceId(x.namespaceId) !== id)
          setActiveTabId((cur) => {
            if (cur && tabs.some((x) => x.id === cur && normalizeNamespaceId(x.namespaceId) === id)) {
              return next[next.length - 1]?.id ?? null
            }
            return cur
          })
          return next
        })
        setConfigChildren((m) => {
          const next = { ...m }
          delete next[nsTreeKey(id)]
          return next
        })
        const list = await reloadNamespaces()
        if (normalizeNamespaceId(nsId) === id) {
          setNsId(pickDefaultNamespace(list))
        }
      } catch (e) {
        setError(errMessage(e))
      } finally {
        setSaving(false)
      }
    },
    [readOnly, namespaces, askConfirm, t, invoke, flash, reloadNamespaces, nsId],
  )

  const closeHistory = useCallback(() => {
    setHistoryOpen(false)
    setHistorySelected(null)
  }, [])

  const mergeHistoryRow = useCallback((next: ConfigHistoryRow) => {
    setHistoryRows((prev) =>
      prev.map((r, i) => (historyRowKey(r, i) === historyRowKey(next, i) || historyRowKey(r) === historyRowKey(next) ? next : r)),
    )
  }, [])

  const enrichHistoryRow = useCallback(
    async (row: ConfigHistoryRow): Promise<ConfigHistoryRow | null> => {
      if (!activeTab || !selected) return null
      if (row.content != null && row.content !== '') return row
      const nid = row.nid || row.id || ''
      if (!nid) return row
      const detail = (await invoke('nacos/configs/history/get', {
        dataId: selected.dataId,
        group: selected.group,
        namespaceId: activeTab.namespaceId,
        nid,
      })) as ConfigHistoryRow
      return { ...row, ...detail }
    },
    [activeTab, selected, invoke],
  )

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
      const res = (await invoke('nacos/configs/history/list', {
        dataId: selected.dataId,
        group: selected.group,
        namespaceId: activeTab.namespaceId,
        pageSize: 30,
        pageNo: 1,
      })) as { histories?: ConfigHistoryRow[] }
      const list = res.histories || []
      setHistoryRows(list)
      if (list[0]) {
        try {
          const enriched = await enrichHistoryRow(list[0])
          if (enriched) {
            setHistoryRows((prev) => prev.map((r, i) => (i === 0 ? enriched : r)))
            setHistorySelected(enriched)
          }
        } catch {
          /* leave unselected */
        }
      }
    } catch (e) {
      setError(errMessage(e))
      setHistoryRows([])
    } finally {
      setHistoryLoading(false)
    }
  }, [activeTab, selected, historyOpen, invoke, closeHistory, enrichHistoryRow])

  const selectHistory = useCallback(
    async (row: ConfigHistoryRow) => {
      setError('')
      try {
        const next = await enrichHistoryRow(row)
        if (!next) return
        // content may legitimately be empty; only fail when detail fetch left it unloaded
        if (next.content == null && !(next.nid || next.id)) {
          setError(t('historyNoContent'))
          return
        }
        mergeHistoryRow(next)
        setHistorySelected(next)
      } catch (e) {
        setError(errMessage(e))
      }
    },
    [enrichHistoryRow, mergeHistoryRow, t],
  )

  const restoreHistory = useCallback(
    async (row: ConfigHistoryRow) => {
      if (readOnly || !activeTab || !selected) return
      setSaving(true)
      setError('')
      try {
        const next = await enrichHistoryRow(row)
        if (!next || next.content == null) {
          setError(t('historyNoContent'))
          return
        }
        patchActiveTab({
          editing: true,
          draft: next.content,
          draftType: next.type || selected.type || 'text',
        })
        closeHistory()
        flash(t('historyRestored'))
      } catch (e) {
        setError(errMessage(e))
      } finally {
        setSaving(false)
      }
    },
    [readOnly, activeTab, selected, enrichHistoryRow, patchActiveTab, flash, t, closeHistory],
  )

  const changeNs = useCallback((next: string) => {
    const id = normalizeNamespaceId(next)
    setSelectedService(null)
    setInstances([])
    setNsId(id)
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
    if (tab === 'configs') void loadConfigs()
    if (tab === 'services') void loadServices()
  }, [bridge, connectionId, nsReady, nsId, tab, loadConfigs, loadServices])

  const setNav = (next: Tab) => {
    setTab(next)
  }

  const statusLine = [
    info?.baseUrl || '',
    info?.v3Api ? 'v3' : 'v2',
    readOnly ? t('readOnly') : '',
    nsId ? `ns:${nsId}` : t('publicNs'),
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
        onNavigate={setNav}
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
              onOpen={(next, ns) => {
                if (ns !== undefined) setNsId(normalizeNamespaceId(ns))
                setTab(next)
              }}
            />
          ) : null}

          {tab === 'configs' ? (
            <ConfigsPanel
              nsId={nsId}
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
              draftType={draftType}
              editing={editing}
              saving={saving}
              expanded={configExpanded}
              childrenByNs={configChildren}
              loadingNs={configLoadingNs}
              isDirty={isDirty}
              t={t}
              onNsChange={changeNs}
              onToggleNs={(id) => void toggleConfigNs(id)}
              onRefresh={() => void loadConfigs()}
              onSelect={(row) => void openConfig(row, row.tenant ?? nsId)}
              onActivateTab={setActiveTabId}
              onCloseTab={(id) => void closeConfigTab(id)}
              onCloseOtherTabs={(id) => void closeOtherTabs(id)}
              onCloseTabsRight={(id) => void closeTabsToRight(id)}
              onCloseAllTabs={() => void closeAllTabs()}
              onDraft={(v) => patchActiveTab({ draft: v })}
              onDraftType={(v) => patchActiveTab({ draftType: v })}
              onMetaChange={(meta) => {
                if (!selected) return
                patchActiveTab({
                  detail: {
                    ...selected,
                    ...(meta.dataId !== undefined ? { dataId: meta.dataId } : {}),
                    ...(meta.group !== undefined ? { group: meta.group } : {}),
                  },
                })
              }}
              onStartEdit={() => {
                if (!selected) return
                patchActiveTab({
                  editing: true,
                  draft: selected.content || '',
                  draftType: selected.type || 'text',
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
                    draftType: selected.type || 'text',
                  })
                })()
              }}
              onPublish={() => void publishConfig()}
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
              onDeleteNamespace={(id) => void deleteNamespace(id)}
              historyOpen={historyOpen}
              historyLoading={historyLoading}
              historyRows={historyRows}
              historySelected={historySelected}
              onToggleHistory={() => void toggleHistory()}
              onCloseHistory={closeHistory}
              onSelectHistory={(row) => void selectHistory(row)}
              onRestoreHistory={(row) => void restoreHistory(row)}
              onCopyText={(text) => void copyText(text)}
              onBatchOpen={(items) => void batchOpenConfigs(items)}
              onBatchClone={(items) => void batchCloneConfigs(items)}
              onBatchDelete={(items) => void batchDeleteConfigs(items)}
            />
          ) : null}

          {tab === 'services' ? (
            <ServicesPanel
              nsId={nsId}
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
