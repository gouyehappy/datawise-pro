/**
 * Classic Kibana 7 _source cell with yellow query-term marks
 * (compare: Discover highlights hh_30 / t00002 / 2063c7f4 in _source).
 */
import {
  dig,
  formatFieldValue,
  highlightText,
  textMatchesQuery,
  truncateForDiscover,
} from '../lib/format'

const SOURCE_PREVIEW_FIELDS = 16
const SOURCE_VALUE_LEN = 120

type Props = {
  source: Record<string, unknown>
  query: string
  columns: string[]
}

export function SourceCell({ source, query, columns }: Props) {
  if (columns.length > 0) {
    return (
      <div className="truncate-by-height">
        <div className="dscSource dscSource--classic">
          {columns.map((field, i) => {
            const text = truncateForDiscover(
              formatFieldValue(dig(source, field)),
              query,
              SOURCE_VALUE_LEN,
            )
            return (
              <span key={field}>
                {i > 0 ? ' ' : null}
                <span className="dscSource__key">{field}:</span>{' '}
                <Highlighted text={text} query={query} />
              </span>
            )
          })}
        </div>
      </div>
    )
  }

  // Prefer fields that contain query hits so yellow marks appear in the clipped preview
  const entries = Object.entries(source)
  const ranked = query.trim()
    ? [...entries].sort((a, b) => {
        const am = textMatchesQuery(formatFieldValue(a[1]), query) ? 1 : 0
        const bm = textMatchesQuery(formatFieldValue(b[1]), query) ? 1 : 0
        return bm - am
      })
    : entries
  const shown = ranked.slice(0, SOURCE_PREVIEW_FIELDS)
  const more = entries.length - shown.length
  // Slightly taller when searching so more marks stay visible
  const clampClass = query.trim() ? 'truncate-by-height truncate-by-height--search' : 'truncate-by-height'

  return (
    <div className={clampClass}>
      <div className="dscSource dscSource--classic">
        {shown.map(([key, val], i) => {
          const text = truncateForDiscover(formatFieldValue(val), query, SOURCE_VALUE_LEN)
          return (
            <span key={key}>
              {i > 0 ? ' ' : null}
              <span className="dscSource__key">{key}:</span>{' '}
              <Highlighted text={text} query={query} />
            </span>
          )
        })}
        {more > 0 ? <span className="dscSource__more"> … +{more} fields</span> : null}
      </div>
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
