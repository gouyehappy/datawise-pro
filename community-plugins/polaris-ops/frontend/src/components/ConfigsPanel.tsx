import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_EDITOR_FONT_SIZE,
  type EditorFontSize,
  readEditorFontSize,
  writeEditorFontSize,
} from '../lib/editorPrefs'
import type { LocaleDict } from '../lib/i18n'
import { formatListStatus } from '../lib/listStatus'
import { nsIdFromTreeKey, type NsOption } from '../lib/ns'
import { filterTreeChildren } from '../lib/treeFilter'
import {
  CONFIG_FORMATS,
  isOpenTabDirty,
  openConfigId,
  type CheckedConfig,
  type ConfigDetail,
  type ConfigHistoryRow,
  type ConfigRow,
  type OpenConfigTab,
} from '../lib/types'
import { CodeEditor } from './CodeEditor'
import { ConfigTabs } from './ConfigTabs'
import { EditorPrefs } from './EditorPrefs'
import { FullscreenToggle } from './FullscreenToggle'
import { HistoryDiffPanel } from './HistoryDiffPanel'
import { NamespaceTree, type TreeChild } from './NamespaceTree'
import { SplitPane } from './SplitPane'

type Props = {
  nsId: string
  nsOptions: NsOption[]
  readOnly: boolean
  configs: ConfigRow[]
  totalCount: number
  truncated: boolean
  loading: boolean
  detailLoading: boolean
  openTabs: OpenConfigTab[]
  activeTabId: string | null
  isNew: boolean
  selected: ConfigDetail | null
  draft: string
  draftFormat: string
  editing: boolean
  saving: boolean
  expanded: Record<string, boolean>
  childrenByNs: Record<string, TreeChild[]>
  loadingNs: Record<string, boolean>
  historyOpen?: boolean
  historyLoading?: boolean
  historyRows?: ConfigHistoryRow[]
  historySelected?: ConfigHistoryRow | null
  t: (key: keyof LocaleDict, vars?: Record<string, string | number>) => string
  onNsChange: (nsId: string) => void
  onToggleNs: (nsId: string) => void
  onRefresh: () => void
  onSelect: (row: ConfigRow) => void
  onActivateTab: (id: string) => void
  onCloseTab: (id: string) => void
  onCloseOtherTabs: (id: string) => void
  onCloseTabsRight: (id: string) => void
  onCloseAllTabs: () => void
  onDraft: (v: string) => void
  onDraftFormat: (v: string) => void
  onMetaChange: (meta: { name?: string; group?: string }) => void
  onStartEdit: () => void
  onDiscard: () => void
  onUpdate: () => void
  onDelete: () => void
  onClone: () => void
  onBeginCreate: (nsId?: string) => void
  onRefreshNs: (nsId: string) => void
  onCloneConfig: (nsId: string, row: ConfigRow) => void
  onDeleteConfig: (nsId: string, row: ConfigRow) => void
  onCreateNamespace?: () => void
  onDeleteNamespace?: (nsId: string) => void
  onCopyText: (text: string) => void
  onBatchOpen: (items: CheckedConfig[]) => void | Promise<void>
  onBatchClone: (items: CheckedConfig[]) => void | Promise<void>
  onBatchDelete: (items: CheckedConfig[]) => void | Promise<void>
  onToggleHistory?: () => void
  onCloseHistory?: () => void
  onSelectHistory?: (row: ConfigHistoryRow) => void
  onRestoreHistory?: (row: ConfigHistoryRow) => void
  isDirty: boolean
}

export function ConfigsPanel(props: Props) {
  const {
    nsId, nsOptions, readOnly, configs, totalCount, truncated, loading, detailLoading,
    openTabs, activeTabId, isNew, selected, draft, draftFormat, editing, saving,
    expanded, childrenByNs, loadingNs, historyOpen, historyLoading, historyRows, historySelected,
    t, onNsChange, onToggleNs, onRefresh, onSelect,
    onActivateTab, onCloseTab, onCloseOtherTabs, onCloseTabsRight, onCloseAllTabs,
    onDraft, onDraftFormat, onMetaChange, onStartEdit, onDiscard,
    onUpdate, onDelete, onClone, onBeginCreate, onRefreshNs, onCloneConfig, onDeleteConfig,
    onCreateNamespace, onDeleteNamespace, onCopyText, onBatchOpen, onBatchClone, onBatchDelete,
    onToggleHistory, onCloseHistory, onSelectHistory, onRestoreHistory, isDirty,
  } = props

  const [filter, setFilter] = useState('')
  const [fontSize, setFontSize] = useState<EditorFontSize>(DEFAULT_EDITOR_FONT_SIZE)
  const [fullscreen, setFullscreen] = useState(false)
  const [batchMode, setBatchMode] = useState(false)
  const [checkedKeys, setCheckedKeys] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setFontSize(readEditorFontSize())
  }, [])

  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [fullscreen])

  useEffect(() => {
    if (!selected) setFullscreen(false)
  }, [selected])

  const setEditorFont = (next: EditorFontSize) => {
    setFontSize(next)
    writeEditorFontSize(next)
  }

  const formatOptions = useMemo(() => {
    const base = CONFIG_FORMATS.map((x) => ({ value: x, label: x }))
    if (selected?.format && !(CONFIG_FORMATS as readonly string[]).includes(selected.format)) {
      return [...base, { value: selected.format, label: selected.format }]
    }
    return base
  }, [selected?.format])

  const filteredChildren = useMemo(
    () => filterTreeChildren(childrenByNs, filter, 'configs'),
    [childrenByNs, filter],
  )

  const status = useMemo(
    () =>
      formatListStatus(t, {
        loading,
        truncated,
        shown: configs.length,
        total: totalCount,
      }),
    [loading, truncated, configs.length, totalCount, t],
  )

  const selectedKey =
    selected && !isNew ? openConfigId(selected, selected.namespace ?? nsId) : ''
  const editorValue = editing || isNew ? draft : selected?.content || ''
  const editorFormat = editing || isNew ? draftFormat : selected?.format || 'text'
  const activeNs = selected?.namespace ?? nsId
  const nsLabel =
    nsOptions.find((o) => o.value === activeNs)?.label ||
    (activeNs ? activeNs : t('allNs'))

  const tabItems = useMemo(
    () =>
      openTabs.map((tab) => ({
        id: tab.id,
        title: tab.isNew
          ? (tab.detail.name || '').trim() || t('untitled')
          : tab.detail.name,
        subtitle: `${tab.detail.group || 'DEFAULT'} · ${
          nsOptions.find((o) => o.value === tab.namespace)?.label ||
          (tab.namespace ? tab.namespace : t('allNs'))
        }`,
        dirty: isOpenTabDirty(tab),
        loading: Boolean(tab.loading),
      })),
    [openTabs, nsOptions, t],
  )

  const canCreateNew = isNew && Boolean((selected?.name || '').trim())

  const checkedItems = useMemo(() => {
    const items: CheckedConfig[] = []
    for (const [treeKey, kids] of Object.entries(childrenByNs)) {
      const namespaceId = nsIdFromTreeKey(treeKey)
      for (const child of kids) {
        if (child.kind !== 'config') continue
        const key = openConfigId(child.row, namespaceId)
        if (checkedKeys[key]) {
          items.push({ key, namespaceId, row: child.row })
        }
      }
    }
    return items
  }, [childrenByNs, checkedKeys])

  const toggleCheck = (namespaceId: string, row: ConfigRow) => {
    const key = openConfigId(row, namespaceId)
    setCheckedKeys((m) => {
      const next = { ...m }
      if (next[key]) delete next[key]
      else next[key] = true
      return next
    })
  }

  const clearChecked = () => setCheckedKeys({})

  const exitBatchMode = () => {
    setBatchMode(false)
    clearChecked()
  }

  return (
    <div className="panel-stack">
      <div className="toolbar">
        <input
          className="field"
          style={{ minWidth: 180, flex: 1 }}
          placeholder={`${t('name')} / ${t('group')}`}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button className="btn" type="button" disabled={loading} onClick={onRefresh}>{t('refresh')}</button>
        {!readOnly ? (
          <button className="btn btn--accent" type="button" onClick={() => onBeginCreate()}>{t('newConfig')}</button>
        ) : null}
        <span className="toolbar__status">{status}</span>
      </div>

      <SplitPane
        defaultWidth={300}
        minWidth={220}
        maxWidth={440}
        left={
          <div className={`pane pane--tree ${batchMode ? 'is-batch' : ''}`}>
            <div className={`pane__caption ${batchMode ? 'is-batch' : ''}`}>
              {batchMode ? (
                <>
                  <span className="pane__caption-label">
                    {checkedItems.length > 0
                      ? t('batchSelected', { count: checkedItems.length })
                      : t('batch')}
                  </span>
                  <div className="pane__caption-actions">
                    {checkedItems.length > 0 ? (
                      <>
                        <button
                          type="button"
                          className="pane__cap-btn"
                          disabled={saving}
                          onClick={() => void onBatchOpen(checkedItems)}
                        >
                          {t('batchOpen')}
                        </button>
                        {!readOnly ? (
                          <>
                            <button
                              type="button"
                              className="pane__cap-btn"
                              disabled={saving}
                              onClick={() => {
                                void onBatchClone(checkedItems)
                                clearChecked()
                              }}
                            >
                              {t('batchClone')}
                            </button>
                            <button
                              type="button"
                              className="pane__cap-btn pane__cap-btn--danger"
                              disabled={saving}
                              onClick={() => {
                                void (async () => {
                                  await onBatchDelete(checkedItems)
                                  clearChecked()
                                })()
                              }}
                            >
                              {t('batchDelete')}
                            </button>
                          </>
                        ) : null}
                      </>
                    ) : null}
                    <button type="button" className="pane__cap-btn pane__cap-btn--accent" onClick={exitBatchMode}>
                      {t('batchDone')}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="pane__caption-label">{t('namespaces')}</span>
                  {!readOnly ? (
                    <button
                      type="button"
                      className="pane__cap-btn"
                      onClick={() => setBatchMode(true)}
                    >
                      {t('batch')}
                    </button>
                  ) : null}
                </>
              )}
            </div>
            <div className="pane__scroll">
              <NamespaceTree
                nsOptions={nsOptions}
                nsId={nsId}
                expanded={expanded}
                childrenByNs={filteredChildren}
                loadingNs={loadingNs}
                selectedConfigKey={selectedKey}
                checkedKeys={checkedKeys}
                checkable={batchMode && !readOnly}
                readOnly={readOnly}
                mode="configs"
                t={t}
                onSelectNs={onNsChange}
                onToggleNs={onToggleNs}
                onSelectChild={(ns, child) => {
                  if (child.kind === 'config') onSelect({ ...child.row, namespace: ns || child.row.namespace })
                }}
                onToggleCheck={toggleCheck}
                onRefreshNs={onRefreshNs}
                onCreateInNs={(ns) => onBeginCreate(ns)}
                onCloneConfig={onCloneConfig}
                onDeleteConfig={onDeleteConfig}
                onCreateNamespace={onCreateNamespace}
                onDeleteNamespace={onDeleteNamespace}
                onCopyText={onCopyText}
              />
            </div>
          </div>
        }
        right={
          <div className={`pane pane--editor ${fullscreen ? 'is-fullscreen' : ''}`}>
            <ConfigTabs
              tabs={tabItems}
              activeId={activeTabId}
              onActivate={onActivateTab}
              onClose={onCloseTab}
              onCloseOthers={onCloseOtherTabs}
              onCloseRight={onCloseTabsRight}
              onCloseAll={onCloseAllTabs}
              labels={{
                close: t('closeTab'),
                closeOthers: t('closeOthers'),
                closeRight: t('closeRight'),
                closeAll: t('closeAll'),
                prev: t('tabsPrev'),
                next: t('tabsNext'),
              }}
            />
            {!selected ? (
              <div className="editor-blank">
                <div className="editor-blank__title">{t('selectConfig')}</div>
                <p className="editor-blank__desc">{t('multiTabHint')}</p>
                <div className="editor-blank__row">
                  {!readOnly ? (
                    <button className="btn btn--accent" type="button" onClick={() => onBeginCreate()}>
                      {t('createTitle')}
                    </button>
                  ) : null}
                  <span className="editor-blank__side">{t('welcomeTipOpen')}</span>
                </div>
              </div>
            ) : detailLoading ? (
              <div className="editor-blank editor-blank--loading">
                <div className="editor-blank__title">{t('loadingDetail')}</div>
              </div>
            ) : (
              <>
                <header className={`editor-chrome ${isNew ? 'editor-chrome--draft' : ''}`}>
                  {isNew ? (
                    <>
                      <div className="draft-head">
                        <div className="draft-head__lead">
                          <span className="draft-mark" aria-hidden />
                          <div className="draft-head__text">
                            <div className="draft-head__title">
                              {t('createTitle')}
                              {isDirty ? <span className="chip chip--warn">{t('dirty')}</span> : null}
                            </div>
                            <div className="draft-head__ns">
                              {t('namespaces')} · {nsLabel}
                            </div>
                          </div>
                        </div>
                        <div className="ed-bar" role="toolbar" aria-label="draft actions">
                          <EditorPrefs
                            type={editorFormat || 'text'}
                            typeOptions={formatOptions}
                            typeDisabled={readOnly}
                            fontSize={fontSize}
                            typeLabel={t('format')}
                            fontLabel={t('fontSize')}
                            smallerLabel={t('fontSmaller')}
                            largerLabel={t('fontLarger')}
                            onTypeChange={onDraftFormat}
                            onFontChange={setEditorFont}
                          />
                          <span className="ed-bar__sep" aria-hidden />
                          <FullscreenToggle
                            active={fullscreen}
                            enterLabel={t('fullscreen')}
                            exitLabel={t('exitFullscreen')}
                            onToggle={() => setFullscreen((v) => !v)}
                          />
                          <button
                            className="ed-bar__btn ed-bar__btn--accent"
                            type="button"
                            disabled={saving || !canCreateNew}
                            onClick={onUpdate}
                          >
                            {t('saveCreate')}
                          </button>
                          <button className="ed-bar__btn" type="button" disabled={saving} onClick={onDiscard}>
                            {t('cancel')}
                          </button>
                        </div>
                      </div>
                      <div className="draft-fields">
                        <label className="draft-field draft-field--main">
                          <span className="draft-field__label">{t('name')}</span>
                          <input
                            className="draft-field__input"
                            value={selected.name}
                            placeholder={t('namePlaceholder')}
                            autoFocus
                            spellCheck={false}
                            onChange={(e) => onMetaChange({ name: e.target.value })}
                          />
                        </label>
                        <label className="draft-field">
                          <span className="draft-field__label">{t('group')}</span>
                          <input
                            className="draft-field__input"
                            value={selected.group}
                            placeholder={t('groupPlaceholder')}
                            spellCheck={false}
                            onChange={(e) => onMetaChange({ group: e.target.value })}
                          />
                        </label>
                      </div>
                    </>
                  ) : (
                    <div className="editor-chrome__main">
                      <div className="editor-identity">
                        <div className="editor-identity__title">
                          <span className="editor-identity__file" title={selected.name}>
                            {selected.name}
                          </span>
                          {isDirty ? <span className="chip chip--warn">{t('dirty')}</span> : null}
                          <span className={`chip ${editing ? 'chip--accent' : ''}`}>
                            {editing ? t('editMode') : t('viewMode')}
                          </span>
                        </div>
                        <div className="editor-identity__crumb">
                          <span>{nsLabel}</span>
                          <span className="editor-path__sep">/</span>
                          <span>{selected.group}</span>
                        </div>
                      </div>

                      <div className="ed-bar" role="toolbar" aria-label="editor tools">
                        <EditorPrefs
                          type={editorFormat || 'text'}
                          typeOptions={formatOptions}
                          typeDisabled={!editing || readOnly}
                          fontSize={fontSize}
                          typeLabel={t('format')}
                          fontLabel={t('fontSize')}
                          smallerLabel={t('fontSmaller')}
                          largerLabel={t('fontLarger')}
                          onTypeChange={onDraftFormat}
                          onFontChange={setEditorFont}
                        />
                        <span className="ed-bar__sep" aria-hidden />
                        <FullscreenToggle
                          active={fullscreen}
                          enterLabel={t('fullscreen')}
                          exitLabel={t('exitFullscreen')}
                          onToggle={() => setFullscreen((v) => !v)}
                        />
                        {!readOnly && !editing ? (
                          <button className="ed-bar__btn" type="button" onClick={onStartEdit}>
                            {t('edit')}
                          </button>
                        ) : null}
                        {editing ? (
                          <>
                            <button
                              className="ed-bar__btn ed-bar__btn--accent"
                              type="button"
                              disabled={saving || !isDirty}
                              onClick={onUpdate}
                            >
                              {t('update')}
                            </button>
                            <button className="ed-bar__btn" type="button" disabled={saving} onClick={onDiscard}>
                              {t('discard')}
                            </button>
                          </>
                        ) : null}
                        {onToggleHistory ? (
                          <button
                            className={`ed-bar__btn ${historyOpen ? 'is-active' : ''}`}
                            type="button"
                            disabled={saving}
                            onClick={onToggleHistory}
                          >
                            {t('history')}
                          </button>
                        ) : null}
                        {!readOnly ? (
                          <>
                            <button className="ed-bar__btn" type="button" disabled={saving} onClick={onClone}>
                              {t('clone')}
                            </button>
                            <button className="ed-bar__btn ed-bar__btn--danger" type="button" disabled={saving} onClick={onDelete}>
                              {t('delete')}
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  )}
                </header>
                {historyOpen && !isNew && onCloseHistory && onSelectHistory && onRestoreHistory ? (
                  <HistoryDiffPanel
                    loading={Boolean(historyLoading)}
                    rows={historyRows || []}
                    selected={historySelected ?? null}
                    currentContent={editorValue}
                    currentFormat={editorFormat}
                    currentMd5={selected?.md5}
                    readOnly={readOnly}
                    saving={saving}
                    t={t}
                    onClose={onCloseHistory}
                    onSelect={onSelectHistory}
                    onRestore={onRestoreHistory}
                  />
                ) : (
                  <div className="editor-stage">
                    <CodeEditor
                      value={editorValue}
                      language={editorFormat}
                      fontSize={fontSize}
                      readOnly={(!editing && !isNew) || readOnly}
                      onChange={onDraft}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        }
      />
    </div>
  )
}
