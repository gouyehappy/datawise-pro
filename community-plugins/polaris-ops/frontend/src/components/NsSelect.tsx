import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { NsOption } from '../lib/ns'

type Props = {
  value: string
  options: NsOption[]
  ariaLabel: string
  onChange: (value: string) => void
}

export function NsSelect({ value, options, ariaLabel, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()

  const current = options.find((o) => o.value === value) || options[0]
  const label = current?.label ?? value

  useEffect(() => {
    if (!open) return
    const idx = Math.max(0, options.findIndex((o) => o.value === value))
    setActiveIdx(idx)
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open, options, value])

  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="1"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIdx])

  const pick = (next: string) => {
    onChange(next)
    setOpen(false)
  }

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setOpen(true)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, Math.max(options.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const hit = options[activeIdx]
      if (hit) pick(hit.value)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div className={`ns-select ${open ? 'is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="ns-select__trigger field"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        title={label}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKey}
      >
        <span className="ns-select__label">{label}</span>
        <svg className="ns-select__chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path
            d="M2.2 3.6 5 6.4 7.8 3.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <ul
          ref={listRef}
          id={listId}
          className="ns-select__menu"
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          onKeyDown={onListKey}
        >
          {options.map((opt, i) => {
            const selected = opt.value === value
            const active = i === activeIdx
            return (
              <li key={opt.value || '__ns'} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-active={active ? '1' : undefined}
                  className={`ns-select__option ${selected ? 'is-selected' : ''} ${active ? 'is-active' : ''}`}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => pick(opt.value)}
                >
                  {opt.label}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
