import type { LocaleDict } from '../lib/i18n'
import type { NacosInfo, Ns, Tab } from '../lib/types'
import { normalizeNamespaceId } from '../lib/ns'

type Props = {
  info: NacosInfo | null
  namespaces: Ns[]
  t: (key: keyof LocaleDict, vars?: Record<string, string | number>) => string
  onOpen: (tab: Tab, nsId?: string) => void
}

export function OverviewPanel({ info, namespaces, t, onOpen }: Props) {
  const host = info?.host || info?.baseUrl || '—'
  const nsCount = info?.namespaceCount ?? namespaces.length
  const connected = Boolean(info?.baseUrl || info?.host)

  return (
    <div className="overview">
      <section className="pane overview__conn">
        <div className="pane__caption">
          <span className="pane__caption-label">{t('connection')}</span>
        </div>

        <div className="overview__body">
          <div className={`overview__status ${connected ? 'is-live' : ''}`}>
            <div className="overview__status-main">
              <div className="overview__status-host" title={host}>
                {host}
              </div>
              <div className="overview__status-sub mono" title={info?.baseUrl || ''}>
                {info?.baseUrl || t('notConnected')}
              </div>
            </div>
            <div className="overview__chips">
              <span className={`chip ${info?.authenticated ? 'chip--ok' : ''}`}>
                {info?.authenticated ? t('authenticated') : t('anonymous')}
              </span>
              {info?.readOnly ? <span className="chip chip--warn">{t('readOnly')}</span> : null}
              <span className="chip chip--accent">{info?.v3Api ? 'v3' : 'v2'}</span>
              {info?.implementation ? <span className="chip">{info.implementation}</span> : null}
            </div>
          </div>

          <dl className="kv overview__kv">
            <dt>{t('host')}</dt>
            <dd title={info?.host || ''}>{info?.host || '—'}</dd>
            <dt>{t('baseUrl')}</dt>
            <dd className="mono" title={info?.baseUrl || ''}>
              {info?.baseUrl || '—'}
            </dd>
            <dt>{t('versionMode')}</dt>
            <dd>{info?.versionMode || '—'}</dd>
            <dt>{t('defaultNs')}</dt>
            <dd>{normalizeNamespaceId(info?.defaultNamespace) || t('publicNs')}</dd>
            <dt>{t('namespaces')}</dt>
            <dd>{nsCount}</dd>
          </dl>
        </div>

        <div className="overview__actions">
          <button className="btn btn--accent" type="button" onClick={() => onOpen('configs')}>
            {t('openConfigs')}
          </button>
          <button className="btn btn--soft" type="button" onClick={() => onOpen('services')}>
            {t('openServices')}
          </button>
        </div>
      </section>

      <section className="pane overview__ns">
        <div className="pane__caption">
          <span className="pane__caption-label">{t('namespaces')}</span>
          <span className="chip">{nsCount}</span>
        </div>

        <div className="pane__scroll">
          {namespaces.length === 0 ? (
            <div className="overview__empty">
              <div className="overview__empty-title">{t('emptyNamespaces')}</div>
              <p className="overview__empty-hint">{t('emptyNamespacesHint')}</p>
            </div>
          ) : (
            <table className="list-table list-table--clickable overview__table">
              <thead>
                <tr>
                  <th>{t('namespaces')}</th>
                  <th>{t('namespaceId')}</th>
                  <th>{t('configs')}</th>
                  <th className="overview__col-action" />
                </tr>
              </thead>
              <tbody>
                {namespaces.map((n) => {
                  const id = normalizeNamespaceId(n.id)
                  const label = n.name || (id ? id : t('publicNs'))
                  return (
                    <tr
                      key={id || '__public'}
                      onClick={() => onOpen('configs', id)}
                      title={label}
                    >
                      <td className="overview__cell-name">{label}</td>
                      <td className="mono muted overview__cell-id">{id || t('publicNs')}</td>
                      <td className="overview__cell-count">{n.configCount ?? '—'}</td>
                      <td className="overview__col-action">
                        <button
                          className="btn btn--soft overview__row-btn"
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onOpen('configs', id)
                          }}
                        >
                          {t('openNs')}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}
