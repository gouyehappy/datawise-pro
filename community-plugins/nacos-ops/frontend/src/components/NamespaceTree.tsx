import { useState, type MouseEvent as ReactMouseEvent } from 'react'
import { configTypeTone, resolveConfigType } from '../lib/configType'
import type { LocaleDict } from '../lib/i18n'
import { nsTreeKey, type NsOption } from '../lib/ns'
import { openConfigId, serviceKey, type ConfigRow, type ServiceRow } from '../lib/types'
import { ContextMenu, type CtxItem } from './ContextMenu'

export type TreeChild =
  | { kind: 'config'; row: ConfigRow }
  | { kind: 'service'; row: ServiceRow }

type Props = {
  nsOptions: NsOption[]
  nsId: string
  expanded: Record<string, boolean>
  childrenByNs: Record<string, TreeChild[]>
  loadingNs: Record<string, boolean>
  selectedConfigKey?: string
  selectedServiceKey?: string
  checkedKeys?: Record<string, boolean>
  checkable?: boolean
  readOnly?: boolean
  mode: 'configs' | 'services'
  t: (key: keyof LocaleDict, vars?: Record<string, string | number>) => string
  onSelectNs: (nsId: string) => void
  onToggleNs: (nsId: string) => void
  onSelectChild: (nsId: string, child: TreeChild) => void
  onToggleCheck?: (nsId: string, row: ConfigRow) => void
  onRefreshNs?: (nsId: string) => void
  onCreateInNs?: (nsId: string) => void
  onCreateNamespace?: () => void
  onDeleteNamespace?: (nsId: string) => void
  onCloneConfig?: (nsId: string, row: ConfigRow) => void
  onDeleteConfig?: (nsId: string, row: ConfigRow) => void
  onCopyText?: (text: string) => void
}

type MenuState =
  | { x: number; y: number; kind: 'ns'; nsId: string; open: boolean }
  | { x: number; y: number; kind: 'config'; nsId: string; row: ConfigRow }
  | { x: number; y: number; kind: 'service'; nsId: string; row: ServiceRow }

export function NamespaceTree({
  nsOptions,
  nsId,
  expanded,
  childrenByNs,
  loadingNs,
  selectedConfigKey,
  selectedServiceKey,
  checkedKeys,
  checkable,
  readOnly,
  mode,
  t,
  onSelectNs,
  onToggleNs,
  onSelectChild,
  onToggleCheck,
  onRefreshNs,
  onCreateInNs,
  onCreateNamespace,
  onDeleteNamespace,
  onCloneConfig,
  onDeleteConfig,
  onCopyText,
}: Props) {
  const [menu, setMenu] = useState<MenuState | null>(null)

  const openAt = (
    e: ReactMouseEvent,
    next:
      | { kind: 'ns'; nsId: string; open: boolean }
      | { kind: 'config'; nsId: string; row: ConfigRow }
      | { kind: 'service'; nsId: string; row: ServiceRow },
  ) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ ...next, x: e.clientX, y: e.clientY })
  }

  const menuItems = (): CtxItem[] => {
    if (!menu) return []
    if (menu.kind === 'ns') {
      const items: CtxItem[] = [
        {
          type: 'item',
          id: 'toggle',
          label: menu.open ? t('collapseNs') : t('expandNs'),
          icon: menu.open ? 'collapse' : 'expand',
        },
        { type: 'item', id: 'refresh', label: t('refresh'), icon: 'refresh' },
      ]
      if (!readOnly) {
        items.push({ type: 'sep' })
        if (mode === 'configs') {
          items.push({ type: 'item', id: 'create', label: t('newConfig'), icon: 'create' })
        }
        items.push({ type: 'item', id: 'createNs', label: t('newNamespace'), icon: 'createNs' })
        if (menu.nsId) {
          items.push({
            type: 'item',
            id: 'deleteNs',
            label: t('deleteNamespace'),
            icon: 'delete',
            danger: true,
          })
        }
      }
      return items
    }
    if (menu.kind === 'service') {
      return [
        { type: 'item', id: 'open', label: t('openItem'), icon: 'open' },
        { type: 'item', id: 'copyName', label: t('copyName'), icon: 'copy' },
      ]
    }
    const items: CtxItem[] = [
      { type: 'item', id: 'open', label: t('openItem'), icon: 'open' },
      { type: 'item', id: 'copyId', label: t('copyDataId'), icon: 'copy' },
    ]
    if (!readOnly) {
      items.push({ type: 'sep' })
      items.push({ type: 'item', id: 'clone', label: t('clone'), icon: 'clone' })
      items.push({ type: 'item', id: 'delete', label: t('delete'), icon: 'delete', danger: true })
    }
    return items
  }

  const onMenuSelect = (id: string) => {
    if (!menu) return
    if (menu.kind === 'ns') {
      if (id === 'toggle') onToggleNs(menu.nsId)
      else if (id === 'refresh') onRefreshNs?.(menu.nsId)
      else if (id === 'create') onCreateInNs?.(menu.nsId)
      else if (id === 'createNs') onCreateNamespace?.()
      else if (id === 'deleteNs') onDeleteNamespace?.(menu.nsId)
      return
    }
    if (menu.kind === 'service') {
      if (id === 'open') onSelectChild(menu.nsId, { kind: 'service', row: menu.row })
      else if (id === 'copyName') onCopyText?.(menu.row.name)
      return
    }
    if (id === 'open') onSelectChild(menu.nsId, { kind: 'config', row: menu.row })
    else if (id === 'copyId') onCopyText?.(menu.row.dataId)
    else if (id === 'clone') onCloneConfig?.(menu.nsId, menu.row)
    else if (id === 'delete') onDeleteConfig?.(menu.nsId, menu.row)
  }

  return (
    <div className="ns-tree">
      {nsOptions.map((opt) => {
        const id = opt.value
        const key = nsTreeKey(id)
        const open = Boolean(expanded[key])
        const active = nsId === id
        const kids = childrenByNs[key] || []
        const loading = Boolean(loadingNs[key])
        return (
          <div key={key} className={`ns-tree__node ${open ? 'is-open' : ''}`}>
            <div
              className={`ns-tree__row ${active ? 'is-active' : ''}`}
              onClick={() => onSelectNs(id)}
              onContextMenu={(e) => openAt(e, { kind: 'ns', nsId: id, open })}
            >
              <button
                type="button"
                className={`ns-tree__twist ${open ? 'is-open' : ''}`}
                aria-label={open ? 'collapse' : 'expand'}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleNs(id)
                }}
              />
              <span className="ns-tree__folder" aria-hidden />
              <span className="ns-tree__label" title={opt.label}>
                {opt.label}
              </span>
              <span className="ns-tree__count">
                {loading ? '…' : kids.length > 0 ? kids.length : ''}
              </span>
            </div>
            {open ? (
              <div className="ns-tree__children">
                {loading && kids.length === 0 ? (
                  <div className="ns-tree__empty">{t('loading')}</div>
                ) : kids.length === 0 ? (
                  <div className="ns-tree__empty">
                    {mode === 'configs' ? t('emptyConfigs') : t('emptyServices')}
                  </div>
                ) : (
                  kids.map((child) => {
                    if (child.kind === 'config') {
                      const ck = openConfigId(child.row, id)
                      const typ = resolveConfigType(child.row.dataId, child.row.type)
                      const tone = configTypeTone(typ)
                      const group = child.row.group || 'DEFAULT_GROUP'
                      const checked = Boolean(checkedKeys?.[ck])
                      return (
                        <div
                          key={ck}
                          className={`ns-tree__leaf ${checkable ? 'has-check' : ''} ${selectedConfigKey === ck ? 'is-selected' : ''} ${checked ? 'is-checked' : ''}`}
                          onContextMenu={(e) => openAt(e, { kind: 'config', nsId: id, row: child.row })}
                        >
                          {checkable ? (
                            <label
                              className="ns-tree__check"
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => onToggleCheck?.(id, child.row)}
                              />
                            </label>
                          ) : null}
                          <button
                            type="button"
                            className="ns-tree__leaf-btn"
                            title={`${group} / ${child.row.dataId}`}
                            onClick={() => onSelectChild(id, child)}
                          >
                            <span className={`ns-tree__file ns-tree__file--${tone}`} aria-hidden>
                              <span className="ns-tree__file-fold" />
                            </span>
                            <span className="ns-tree__leaf-body">
                              <span className="ns-tree__leaf-title">{child.row.dataId}</span>
                              <span className="ns-tree__leaf-meta">{group}</span>
                            </span>
                            <span className={`ns-tree__badge ns-tree__badge--${tone}`}>{typ}</span>
                          </button>
                        </div>
                      )
                    }
                    const sk = serviceKey(child.row)
                    return (
                      <button
                        key={sk}
                        type="button"
                        className={`ns-tree__leaf ns-tree__leaf--plain ${selectedServiceKey === sk ? 'is-selected' : ''}`}
                        title={`${child.row.groupName} / ${child.row.name}`}
                        onClick={() => onSelectChild(id, child)}
                        onContextMenu={(e) => openAt(e, { kind: 'service', nsId: id, row: child.row })}
                      >
                        <span className="ns-tree__glyph ns-tree__glyph--svc" aria-hidden />
                        <span className="ns-tree__leaf-body">
                          <span className="ns-tree__leaf-title">{child.row.name}</span>
                          <span className="ns-tree__leaf-meta">
                            <span>{child.row.groupName || 'DEFAULT_GROUP'}</span>
                            {child.row.clusterCount != null && child.row.clusterCount !== '' ? (
                              <>
                                <span className="ns-tree__dot" />
                                <span>{t('clusterCount', { count: String(child.row.clusterCount) })}</span>
                              </>
                            ) : null}
                          </span>
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
            ) : null}
          </div>
        )
      })}

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems()}
          onClose={() => setMenu(null)}
          onSelect={onMenuSelect}
        />
      ) : null}
    </div>
  )
}
