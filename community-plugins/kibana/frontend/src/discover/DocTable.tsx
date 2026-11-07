/**
 * Document table — OSD default_discover_table pattern
 * (expand, columns, _source, filter buttons).
 */
import { Fragment, useState } from 'react'
import { EuiButtonIcon } from '@elastic/eui'
import type { SearchHit } from '../lib/types'
import { formatDiscoverTime } from '../lib/format'
import { SourceCell } from './SourceCell'
import { TableCell } from './TableCell'
import { DocViewer } from './DocViewer'

type Props = {
  hits: SearchHit[]
  query: string
  columns: string[]
  timeField: string
  onAddFilter: (field: string, value: string, negate: boolean) => void
  onToggleColumn: (field: string) => void
}

export function DocTable({
  hits,
  query,
  columns,
  timeField,
  onAddFilter,
  onToggleColumn,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const colSpan = 2 + (columns.length > 0 ? columns.length : 1)

  if (!hits.length) {
    return (
      <div className="dscStatus">No documents found. Try adjusting the time range or query.</div>
    )
  }

  return (
    <div className="dscTableWrap osdDocTable__container">
      <table className="dscTable osdDocTable">
        <thead>
          <tr>
            <th className="dscTable__toggle" />
            <th className="dscTable__time">Time</th>
            {columns.length > 0 ? (
              columns.map((c) => <th key={c}>{c}</th>)
            ) : (
              <th>_source</th>
            )}
          </tr>
        </thead>
        <tbody>
          {hits.map((hit) => {
            const key = `${hit.index}:${hit.id}`
            const open = expanded.has(key)
            const source =
              hit.source && typeof hit.source === 'object'
                ? (hit.source as Record<string, unknown>)
                : {}
            return (
              <Fragment key={key}>
                <tr
                  className={`osdDocTable__row${open ? ' osdDocTable__row--highlight is-open' : ''}`}
                >
                  <td className="dscTable__toggle">
                    <EuiButtonIcon
                      className="dscExpand"
                      size="xs"
                      color="text"
                      iconType={open ? 'arrowDown' : 'arrowRight'}
                      aria-label={open ? 'Collapse document' : 'Expand document'}
                      onClick={() => toggle(key)}
                    />
                  </td>
                  <td className="dscTable__time eui-textNoWrap">
                    {formatDiscoverTime(hit.timestamp || String(source[timeField] || ''))}
                  </td>
                  {columns.length > 0 ? (
                    columns.map((c) => (
                      <td key={c}>
                        <TableCell
                          source={source}
                          field={c}
                          query={query}
                          onAddFilter={onAddFilter}
                        />
                      </td>
                    ))
                  ) : (
                    <td className="osdDocTableCell__source">
                      <SourceCell source={source} query={query} columns={[]} />
                    </td>
                  )}
                </tr>
                {open ? (
                  <tr className="dscDocViewerRow">
                    <DocViewer
                      hit={hit}
                      colSpan={colSpan}
                      query={query}
                      selectedColumns={columns}
                      onAddFilter={onAddFilter}
                      onToggleColumn={onToggleColumn}
                    />
                  </tr>
                ) : null}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
