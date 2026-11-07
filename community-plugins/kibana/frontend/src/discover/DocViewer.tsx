/**
 * Expanded document viewer — OSD DocViewer layout
 * (Table/JSON tabs, left-side field actions, type icons).
 */
import { useMemo, useState } from 'react'
import { EuiButtonEmpty, EuiButtonIcon, EuiToolTip } from '@elastic/eui'
import type { SearchHit } from '../lib/types'
import { flattenSource, formatDiscoverTime, formatFieldValue, highlightText } from '../lib/format'
import { fieldTypeLabel, guessFieldKind } from './fieldTypes'

type Props = {
  hit: SearchHit
  colSpan: number
  query?: string
  selectedColumns: string[]
  onAddFilter: (field: string, value: string, negate: boolean) => void
  onToggleColumn: (field: string) => void
}

export function DocViewer({
  hit,
  colSpan,
  query = '',
  selectedColumns,
  onAddFilter,
  onToggleColumn,
}: Props) {
  const [tab, setTab] = useState<'table' | 'json'>('table')
  const source =
    hit.source && typeof hit.source === 'object' ? (hit.source as Record<string, unknown>) : {}

  const rows = useMemo(() => {
    const meta: Array<{ field: string; value: unknown }> = []
    const ts = hit.timestamp || source['@timestamp']
    if (ts != null) meta.push({ field: '@timestamp', value: ts })
    meta.push({ field: '_id', value: hit.id })
    meta.push({ field: '_index', value: hit.index })
    if (hit.score != null) meta.push({ field: '_score', value: hit.score })
    const flat = flattenSource(source).filter(
      (r) => r.field !== '@timestamp' || ts == null,
    )
    // Prefer meta @timestamp; drop duplicate from source flatten
    return [...meta, ...flat.filter((r) => !meta.some((m) => m.field === r.field))]
  }, [hit, source])

  return (
    <td colSpan={colSpan} style={{ padding: 0 }}>
      <div className="dscDocViewer">
        <div className="dscDocViewer__header">
          <span className="dscDocViewer__title">Expanded document</span>
          <div className="dscDocViewer__links">
            <EuiToolTip content="Surrounding documents are not available in this plugin yet">
              <EuiButtonEmpty size="xs" color="primary" flush="right" disabled>
                View surrounding documents
              </EuiButtonEmpty>
            </EuiToolTip>
            <EuiButtonEmpty
              size="xs"
              color="primary"
              flush="right"
              onClick={() => setTab('json')}
            >
              View single document
            </EuiButtonEmpty>
          </div>
        </div>
        <div className="dscDocViewer__tabs">
          <button
            type="button"
            className={`dscDocViewer__tab${tab === 'table' ? ' is-active' : ''}`}
            onClick={() => setTab('table')}
          >
            Table
          </button>
          <button
            type="button"
            className={`dscDocViewer__tab${tab === 'json' ? ' is-active' : ''}`}
            onClick={() => setTab('json')}
          >
            JSON
          </button>
          <span className="dscDocViewer__meta">
            {hit.index} / {hit.id}
          </span>
        </div>
        {tab === 'table' ? (
          <table className="dscDocViewer__table">
            <tbody>
              {rows.map((r) => {
                const text =
                  r.field === '@timestamp' && typeof r.value === 'string'
                    ? formatDiscoverTime(r.value)
                    : formatFieldValue(r.value)
                const filterable = text !== '—' && text !== ''
                const kind = guessFieldKind(r.field)
                const inTable = selectedColumns.includes(r.field)
                const isMeta = r.field.startsWith('_') || r.field === '@timestamp'
                return (
                  <tr key={r.field}>
                    <td className="dscDocViewer__actions">
                      <span className="dscDocViewer__actionGroup">
                        {filterable ? (
                          <>
                            <EuiToolTip content="Filter for value">
                              <EuiButtonIcon
                                size="xs"
                                color="text"
                                iconType="magnifyWithPlus"
                                aria-label="Filter for value"
                                onClick={() => onAddFilter(r.field, String(r.value ?? text), false)}
                              />
                            </EuiToolTip>
                            <EuiToolTip content="Filter out value">
                              <EuiButtonIcon
                                size="xs"
                                color="text"
                                iconType="magnifyWithMinus"
                                aria-label="Filter out value"
                                onClick={() => onAddFilter(r.field, String(r.value ?? text), true)}
                              />
                            </EuiToolTip>
                          </>
                        ) : (
                          <span className="dscDocViewer__actionSpacer" />
                        )}
                        {!isMeta ? (
                          <>
                            <EuiToolTip
                              content={inTable ? 'Remove column from table' : 'Toggle column in table'}
                            >
                              <EuiButtonIcon
                                size="xs"
                                color={inTable ? 'primary' : 'text'}
                                iconType="list"
                                aria-label="Toggle column in table"
                                onClick={() => onToggleColumn(r.field)}
                              />
                            </EuiToolTip>
                            <EuiToolTip content="Filter for field present">
                              <EuiButtonIcon
                                size="xs"
                                color="text"
                                iconType="filter"
                                aria-label="Filter for field present"
                                onClick={() => onAddFilter(r.field, '*', false)}
                              />
                            </EuiToolTip>
                          </>
                        ) : null}
                      </span>
                    </td>
                    <th className="field-name">
                      <span
                        className={`dscFieldItem__type dscFieldItem__type--${kind} dscDocViewer__type`}
                        aria-hidden
                      >
                        {fieldTypeLabel(kind)}
                      </span>
                      {r.field}
                    </th>
                    <td>
                      <span className="osdDocTableCell__dataField">
                        {highlightText(text, query).map((p, i) =>
                          typeof p === 'string' ? (
                            <span key={i}>{p}</span>
                          ) : (
                            <mark key={i} className="dscMark">
                              {p.mark}
                            </mark>
                          ),
                        )}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <pre className="dscDocViewer__json">
            {JSON.stringify(
              {
                _index: hit.index,
                _id: hit.id,
                _score: hit.score ?? null,
                _source: source,
              },
              null,
              2,
            )}
          </pre>
        )}
      </div>
    </td>
  )
}
