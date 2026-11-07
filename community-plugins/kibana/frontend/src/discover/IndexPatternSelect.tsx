/** Searchable index-pattern picker — Kibana sidebar style. */
import { useMemo, useState } from 'react'
import { EuiFieldSearch, EuiPopover } from '@elastic/eui'

type Props = {
  value: string
  options: Array<{ value: string; text: string }>
  onChange: (value: string) => void
}

export function IndexPatternSelect({ value, options, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return options
    return options.filter((o) => o.text.toLowerCase().includes(needle))
  }, [options, q])

  return (
    <EuiPopover
      className="dscIndexPatternPopover"
      isOpen={open}
      closePopover={() => {
        setOpen(false)
        setQ('')
      }}
      panelPaddingSize="none"
      ownFocus
      display="block"
      button={
        <button
          type="button"
          className="dscIndexPattern"
          onClick={() => setOpen((v) => !v)}
          aria-label="Index pattern"
          title={value}
        >
          <span className="dscIndexPattern__label">{value || 'Select index pattern'}</span>
          <span className="dscIndexPattern__caret" aria-hidden>
            ▾
          </span>
        </button>
      }
    >
      <div className="dscIndexPattern__panel">
        <div className="dscIndexPattern__search">
          <EuiFieldSearch
            compressed
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
        </div>
        <div className="dscIndexPattern__list" role="listbox">
          {filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={`dscIndexPattern__item${o.value === value ? ' is-selected' : ''}`}
              title={o.text}
              onClick={() => {
                onChange(o.value)
                setOpen(false)
                setQ('')
              }}
            >
              {o.text}
            </button>
          ))}
          {!filtered.length ? (
            <div className="dscIndexPattern__empty">No matching patterns</div>
          ) : null}
        </div>
      </div>
    </EuiPopover>
  )
}
