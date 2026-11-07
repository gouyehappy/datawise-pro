import { useEffect, useId, useRef, useState } from 'react'
import { configTypeTone } from '../lib/configType'
import {
  EDITOR_FONT_SIZES,
  type EditorFontSize,
  stepEditorFontSize,
} from '../lib/editorPrefs'

type Props = {
  type: string
  typeOptions: { value: string; label: string }[]
  typeDisabled?: boolean
  fontSize: EditorFontSize
  typeLabel: string
  fontLabel: string
  smallerLabel: string
  largerLabel: string
  onTypeChange: (value: string) => void
  onFontChange: (size: EditorFontSize) => void
}

export function EditorPrefs({
  type,
  typeOptions,
  typeDisabled,
  fontSize,
  typeLabel,
  fontLabel,
  smallerLabel,
  largerLabel,
  onTypeChange,
  onFontChange,
}: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const current = typeOptions.find((o) => o.value === type) || typeOptions[0]
  const label = current?.label ?? type
  const tone = configTypeTone(label)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const atMin = fontSize <= EDITOR_FONT_SIZES[0]
  const atMax = fontSize >= EDITOR_FONT_SIZES[EDITOR_FONT_SIZES.length - 1]

  return (
    <div className="ed-prefs" ref={rootRef}>
      <div className={`ed-prefs__type ${open ? 'is-open' : ''} ${typeDisabled ? 'is-disabled' : ''}`}>
        <button
          type="button"
          className="ed-prefs__type-btn"
          disabled={typeDisabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={typeLabel}
          title={typeLabel}
          onClick={() => {
            if (!typeDisabled) setOpen((v) => !v)
          }}
        >
          <span className={`ed-prefs__swatch ed-prefs__swatch--${tone}`} aria-hidden />
          <span className="ed-prefs__value">{label}</span>
          <svg className="ed-prefs__chev" width="8" height="8" viewBox="0 0 10 10" aria-hidden>
            <path d="M2.2 3.6 5 6.4 7.8 3.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {open ? (
          <ul id={listId} className="ed-prefs__menu" role="listbox" aria-label={typeLabel}>
            {typeOptions.map((opt) => {
              const active = opt.value === type
              const optTone = configTypeTone(opt.label)
              return (
                <li key={opt.value} role="option" aria-selected={active}>
                  <button
                    type="button"
                    className={`ed-prefs__option ${active ? 'is-active' : ''}`}
                    onClick={() => {
                      onTypeChange(opt.value)
                      setOpen(false)
                    }}
                  >
                    <span className={`ed-prefs__swatch ed-prefs__swatch--${optTone}`} aria-hidden />
                    <span className="ed-prefs__option-label">{opt.label}</span>
                    {active ? (
                      <svg className="ed-prefs__check" width="11" height="11" viewBox="0 0 12 12" aria-hidden>
                        <path d="M2.5 6.2 5 8.7 9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <span className="ed-prefs__check-slot" aria-hidden />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>

      <div className="ed-prefs__rule" aria-hidden />

      <div className="ed-prefs__font" role="group" aria-label={fontLabel} title={fontLabel}>
        <button
          type="button"
          className="ed-prefs__step"
          disabled={atMin}
          aria-label={smallerLabel}
          onClick={() => onFontChange(stepEditorFontSize(fontSize, -1))}
        >
          −
        </button>
        <span className="ed-prefs__size">{fontSize}</span>
        <button
          type="button"
          className="ed-prefs__step"
          disabled={atMax}
          aria-label={largerLabel}
          onClick={() => onFontChange(stepEditorFontSize(fontSize, 1))}
        >
          +
        </button>
      </div>
    </div>
  )
}
