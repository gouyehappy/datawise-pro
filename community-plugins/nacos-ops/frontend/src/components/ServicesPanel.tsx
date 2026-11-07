import { useMemo, useState } from 'react'
import type { LocaleDict } from '../lib/i18n'
import { formatListStatus } from '../lib/listStatus'
import type { NsOption } from '../lib/ns'
import { serviceKey, type InstanceRow, type ServiceRow } from '../lib/types'
import { NsSelect } from './NsSelect'
import { SplitPane } from './SplitPane'

type Props = {
  nsId: string
  nsOptions: NsOption[]
  services: ServiceRow[]
  totalCount: number
  truncated: boolean
  loading: boolean
  instancesLoading: boolean
  selected: ServiceRow | null
  instances: InstanceRow[]
  t: (key: keyof LocaleDict, vars?: Record<string, string | number>) => string
  onNsChange: (nsId: string) => void
  onRefresh: () => void
  onSelect: (row: ServiceRow) => void
}

export function ServicesPanel(props: Props) {
  const {
    nsId, nsOptions, services, totalCount, truncated, loading, instancesLoading,
    selected, instances, t, onNsChange, onRefresh, onSelect,
  } = props

  const [filter, setFilter] = useState('')

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return services
    return services.filter(
      (s) =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.groupName || '').toLowerCase().includes(q),
    )
  }, [services, filter])

  const status = useMemo(
    () =>
      formatListStatus(t, {
        loading,
        truncated,
        shown: filtered.length,
        loaded: services.length,
        total: totalCount || services.length,
      }),
    [loading, truncated, filtered.length, services.length, totalCount, t],
  )

  const selectedKey = selected ? serviceKey(selected) : ''
  const nsLabel = nsOptions.find((o) => o.value === nsId)?.label || t('publicNs')

  return (
    <div className="panel-stack">
      <div className="toolbar">
        <NsSelect
          value={nsId}
          options={nsOptions}
          ariaLabel={t('namespaces')}
          onChange={onNsChange}
        />
        <input
          className="field"
          style={{ minWidth: 180, flex: 1 }}
          placeholder={`${t('serviceName')} / ${t('group')}`}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button className="btn" type="button" disabled={loading} onClick={onRefresh}>
          {t('refresh')}
        </button>
        <span className="toolbar__status">{status}</span>
      </div>

      <SplitPane
        defaultWidth={360}
        minWidth={240}
        maxWidth={520}
        left={
          <div className="pane pane--tree">
            <div className="pane__caption">
              <span className="pane__caption-label">{t('services')}</span>
            </div>
            <div className="pane__scroll">
              {loading && filtered.length === 0 ? (
                <div className="editor-empty">
                  <div className="editor-empty__title">{t('loading')}</div>
                </div>
              ) : filtered.length === 0 ? (
                <div className="editor-empty">
                  <div className="editor-empty__title">{t('emptyServices')}</div>
                </div>
              ) : (
                <table className="list-table list-table--clickable">
                  <thead>
                    <tr>
                      <th>{t('serviceName')}</th>
                      <th>{t('group')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => {
                      const key = serviceKey(row)
                      const active = key === selectedKey
                      return (
                        <tr
                          key={key}
                          className={active ? 'is-selected' : undefined}
                          onClick={() => onSelect(row)}
                        >
                          <td className="mono" title={row.name}>
                            {row.name}
                          </td>
                          <td title={row.groupName || 'DEFAULT_GROUP'}>
                            {row.groupName || 'DEFAULT_GROUP'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        }
        right={
          <div className="pane pane--editor">
            {!selected ? (
              <div className="editor-empty">
                <div className="editor-empty__title">{t('selectService')}</div>
                <div className="editor-empty__hint">{nsLabel}</div>
              </div>
            ) : (
              <>
                <header className="editor-chrome">
                  <div className="editor-chrome__main">
                    <div className="editor-identity">
                      <div className="editor-identity__title">
                        <span className="editor-identity__file" title={selected.name}>
                          {selected.name}
                        </span>
                      </div>
                      <div className="editor-identity__crumb">
                        <span>{nsLabel}</span>
                        <span className="editor-path__sep">/</span>
                        <span>{selected.groupName || 'DEFAULT_GROUP'}</span>
                        <span className="editor-identity__dot" aria-hidden />
                        <span className="editor-identity__meta">
                          {instances.length} {t('instances')}
                        </span>
                      </div>
                    </div>
                  </div>
                </header>
                <div className="editor-stage editor-stage--table">
                  {instancesLoading ? (
                    <div className="editor-empty">
                      <div className="editor-empty__title">{t('loading')}</div>
                    </div>
                  ) : instances.length === 0 ? (
                    <div className="editor-empty">
                      <div className="editor-empty__title">{t('emptyInstances')}</div>
                    </div>
                  ) : (
                    <div className="pane__scroll">
                      <table className="list-table">
                        <thead>
                          <tr>
                            <th>{t('ip')}</th>
                            <th>{t('port')}</th>
                            <th>{t('healthy')}</th>
                            <th>{t('weight')}</th>
                            <th>{t('cluster')}</th>
                            <th>{t('enabled')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {instances.map((i, idx) => (
                            <tr key={`${i.ip}:${i.port}:${idx}`}>
                              <td className="mono">{i.ip}</td>
                              <td>{i.port}</td>
                              <td>
                                <span className={`status-dot ${i.healthy ? 'is-ok' : 'is-bad'}`}>
                                  {String(i.healthy)}
                                </span>
                              </td>
                              <td>{String(i.weight ?? '')}</td>
                              <td>{i.clusterName || ''}</td>
                              <td>{String(i.enabled ?? '')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        }
      />
    </div>
  )
}
