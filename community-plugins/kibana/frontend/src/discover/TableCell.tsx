/**
 * Column cell with hover filter +/- — adapted from OSD `table_cell.tsx`.
 */
import { EuiButtonIcon, EuiToolTip } from '@elastic/eui'
import { dig, formatFieldValue, highlightText, truncateForDiscover } from '../lib/format'

type Props = {
  source: Record<string, unknown>
  field: string
  query: string
  onAddFilter: (field: string, value: string, negate: boolean) => void
}

export function TableCell({ source, field, query, onAddFilter }: Props) {
  const raw = dig(source, field)
  const full = formatFieldValue(raw)
  const text = truncateForDiscover(full, query)
  const filterable = full !== '—' && full !== ''

  return (
    <div className="osdDocTableCell">
      <span className="osdDocTableCell__dataField">
        <Highlighted text={text} query={query} />
      </span>
      {filterable ? (
        <span className="osdDocTableCell__filter">
          <EuiToolTip content="Filter for value">
            <EuiButtonIcon
              size="xs"
              iconType="magnifyWithPlus"
              aria-label="Filter for value"
              className="osdDocTableCell__filterButton"
              onClick={() => onAddFilter(field, full, false)}
            />
          </EuiToolTip>
          <EuiToolTip content="Filter out value">
            <EuiButtonIcon
              size="xs"
              iconType="magnifyWithMinus"
              aria-label="Filter out value"
              className="osdDocTableCell__filterButton"
              onClick={() => onAddFilter(field, full, true)}
            />
          </EuiToolTip>
        </span>
      ) : null}
    </div>
  )
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const parts = highlightText(text, query)
  return (
    <>
      {parts.map((p, i) =>
        typeof p === 'string' ? (
          <span key={i}>{p}</span>
        ) : (
          <mark key={i} className="dscMark">
            {p.mark}
          </mark>
        ),
      )}
    </>
  )
}
