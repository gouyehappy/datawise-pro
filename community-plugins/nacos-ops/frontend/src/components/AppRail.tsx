import type { ReactNode } from 'react'
import type { Tab } from '../lib/types'

type Item = {
  id: Tab
  label: string
  icon: ReactNode
}

type Props = {
  title: string
  active: Tab
  items: Item[]
  readOnly: boolean
  readOnlyLabel: string
  baseUrl: string
  onNavigate: (id: Tab) => void
}

function IconOverview() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="2.75" y="2.75" width="6" height="6" rx="1.25" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11.25" y="2.75" width="6" height="6" rx="1.25" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2.75" y="11.25" width="6" height="6" rx="1.25" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11.25" y="11.25" width="6" height="6" rx="1.25" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function IconConfigs() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M5.5 2.75h5.4L15.25 7.1v9.15a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V3.75a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M10.75 2.9V7.1h4.2" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7.25 10.75h5.5M7.25 13.5h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function IconServices() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="4.5" r="2.15" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="4.6" cy="14.6" r="2.15" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="15.4" cy="14.6" r="2.15" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 6.7v2.4M10 9.1 5.9 12.4M10 9.1l4.1 3.3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export const RAIL_ICONS = {
  overview: <IconOverview />,
  configs: <IconConfigs />,
  services: <IconServices />,
} as const

export function AppRail({
  title,
  active,
  items,
  readOnly,
  readOnlyLabel,
  baseUrl,
  onNavigate,
}: Props) {
  return (
    <aside className="rail" aria-label={title}>
      <div className="rail__brand" title={title}>
        <span className="rail__mark" aria-hidden />
      </div>
      <nav className="rail__nav">
        {items.map(({ id, label, icon }) => (
          <button
            key={id}
            type="button"
            className={`rail__btn ${active === id ? 'is-active' : ''}`}
            aria-label={label}
            title={label}
            aria-current={active === id ? 'page' : undefined}
            onClick={() => onNavigate(id)}
          >
            {icon}
          </button>
        ))}
      </nav>
      <div className="rail__foot">
        {readOnly ? (
          <span className="rail__ro" title={readOnlyLabel} aria-label={readOnlyLabel}>
            RO
          </span>
        ) : null}
        <span
          className={`rail__dot ${baseUrl ? 'is-on' : ''}`}
          title={baseUrl || '—'}
          aria-label={baseUrl || '—'}
        />
      </div>
    </aside>
  )
}
