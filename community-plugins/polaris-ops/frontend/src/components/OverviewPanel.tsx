import type { LocaleDict } from '../lib/i18n'
import type { Ns, PolarisInfo, Tab } from '../lib/types'

type Props = {
  info: PolarisInfo | null
  namespaces: Ns[]
  t: (key: keyof LocaleDict, vars?: Record<string, string | number>) => string
  onOpen: (tab: Tab, ns?: string) => void
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
              <span className="chip">{t('namespaces')} · {nsCount}</span>
            </div>
          </div>

          <dl className="kv overview__kv">
            <dt>{t('host')}</dt>
            <dd title={info?.host || ''}>{info?.host || '—'}</dd>
            <dt>{t('baseUrl')}</dt>
            <dd className="mono" title={info?.baseUrl || ''}>
              {info?.baseUrl || '—'}
            </dd>
            <dt>{t('authenticated')}</dt>
            <dd>{info?.authenticated ? t('yes') : t('no')}</dd>
            <dt>{t('readOnly')}</dt>
            <dd>{info?.readOnly ? t('yes') : t('no')}</dd>
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
                  <th>{t('name')}</th>
                  <th>{t('comment')}</th>
                  <th className="overview__col-action" />
                </tr>
              </thead>
              <tbody>
                {namespaces.map((n, i) => {
                  const name = String(n.name || '').trim()
                  const comment = String(n.comment || '').trim()
                  return (
                    <tr
                      key={name ? name : `__empty-${i}`}
                      onClick={() => onOpen('configs', name)}
                      title={name || '—'}
                    >
                      <td className="overview__cell-name">{name || '—'}</td>
                      <td className="muted overview__cell-id">{comment || '—'}</td>
                      <td className="overview__col-action">
                        <button
                          className="btn btn--soft overview__row-btn"
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onOpen('configs', name)
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
