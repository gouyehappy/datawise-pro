import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type CtxIcon =
  | 'close'
  | 'closeOthers'
  | 'closeRight'
  | 'closeAll'
  | 'expand'
  | 'collapse'
  | 'refresh'
  | 'create'
  | 'createNs'
  | 'open'
  | 'copy'
  | 'clone'
  | 'delete'

export type CtxItem =
  | { type: 'sep' }
  | {
      type: 'item'
      id: string
      label: string
      icon?: CtxIcon
      danger?: boolean
      disabled?: boolean
    }

type Props = {
  x: number
  y: number
  items: CtxItem[]
  onSelect: (id: string) => void
  onClose: () => void
}

const svgBase = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none' as const,
  'aria-hidden': true as const,
  shapeRendering: 'geometricPrecision' as const,
}

const stroke = {
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  vectorEffect: 'non-scaling-stroke' as const,
}

/** Even 16×16 Lucide-style glyphs — crisp on 1×/2× DPR. */
function Icon({ name }: { name: CtxIcon }) {
  const icons: Record<CtxIcon, ReactNode> = {
    close: (
      <svg {...svgBase}>
        <path d="M4 4l8 8M12 4l-8 8" {...stroke} />
      </svg>
    ),
    closeOthers: (
      <svg {...svgBase}>
        <path d="M2.5 4.5h7M2.5 8h10M2.5 11.5h6" {...stroke} />
        <path d="M11.25 3.5l2.25 2.25M13.5 3.5l-2.25 2.25" {...stroke} />
      </svg>
    ),
    closeRight: (
      <svg {...svgBase}>
        <path d="M2.5 4.5h5M2.5 8h6.5M2.5 11.5h4" {...stroke} />
        <path d="M10 4.5 13.5 8 10 11.5" {...stroke} />
      </svg>
    ),
    closeAll: (
      <svg {...svgBase}>
        <rect x="2.75" y="2.75" width="10.5" height="10.5" rx="2" {...stroke} />
        <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" {...stroke} />
      </svg>
    ),
    expand: (
      <svg {...svgBase}>
        <path d="M6 3.5 10.5 8 6 12.5" {...stroke} />
      </svg>
    ),
    collapse: (
      <svg {...svgBase}>
        <path d="M3.5 6 8 10.5 12.5 6" {...stroke} />
      </svg>
    ),
    refresh: (
      <svg {...svgBase}>
        <path d="M13 8a5 5 0 1 1-1.4-3.4" {...stroke} />
        <path d="M13 2.75v3.5H9.5" {...stroke} />
      </svg>
    ),
    create: (
      <svg {...svgBase}>
        <path
          d="M8.75 2.75H5.25A1.5 1.5 0 0 0 3.75 4.25v7.5A1.5 1.5 0 0 0 5.25 13.25h5.5A1.5 1.5 0 0 0 12.25 11.75V7.25Z"
          {...stroke}
        />
        <path d="M8.75 2.75V5.75h3" {...stroke} />
        <path d="M6.25 9h3.5M8 7.25v3.5" {...stroke} />
      </svg>
    ),
    createNs: (
      <svg {...svgBase}>
        <path
          d="M2.75 5V4.35A1.5 1.5 0 0 1 4.25 2.85h2.15l1.2 1.4h4.15A1.5 1.5 0 0 1 13.25 5.75v5.85A1.5 1.5 0 0 1 11.75 13.1H4.25A1.5 1.5 0 0 1 2.75 11.6Z"
          {...stroke}
        />
        <path d="M6.25 8.85h3.5M8 7.1v3.5" {...stroke} />
      </svg>
    ),
    open: (
      <svg {...svgBase}>
        <path
          d="M3.5 4.25A1.5 1.5 0 0 1 5 2.75h3L10.25 5v6.75A1.5 1.5 0 0 1 8.75 13.25H5A1.5 1.5 0 0 1 3.5 11.75Z"
          {...stroke}
        />
        <path d="M8 2.9V5h2.25" {...stroke} />
        <path d="M11 7.25h2.5M13.5 7.25v4.25M13.5 11.5l-1.5-1.5M13.5 11.5l1.5-1.5" {...stroke} />
      </svg>
    ),
    copy: (
      <svg {...svgBase}>
        <rect x="5.5" y="5" width="7" height="8.25" rx="1.35" {...stroke} />
        <path
          d="M10.5 5V3.75A1.25 1.25 0 0 0 9.25 2.5H4.25A1.25 1.25 0 0 0 3 3.75v7A1.25 1.25 0 0 0 4.25 12H5.5"
          {...stroke}
        />
      </svg>
    ),
    clone: (
      <svg {...svgBase}>
        <rect x="2.75" y="4.5" width="7.25" height="8.25" rx="1.35" {...stroke} />
        <path d="M6.5 2.75h5.25A1.5 1.5 0 0 1 13.25 4.25v7.25" {...stroke} />
        <path d="M5 8.25h2.75M6.35 6.9v2.75" {...stroke} />
      </svg>
    ),
    delete: (
      <svg {...svgBase}>
        <path d="M3.25 4.5h9.5" {...stroke} />
        <path d="M6.1 4.5V3.4A1 1 0 0 1 7.1 2.4h1.8a1 1 0 0 1 1 1V4.5" {...stroke} />
        <path
          d="M4.6 4.5l.55 7.35A1.35 1.35 0 0 0 6.5 13.1h3a1.35 1.35 0 0 0 1.35-1.25L11.4 4.5"
          {...stroke}
        />
        <path d="M6.75 7v3.4M9.25 7v3.4" {...stroke} />
      </svg>
    ),
  }

  return <span className="ctx-menu__icon">{icons[name]}</span>
}

export function ContextMenu({ x, y, items, onSelect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const left = Math.min(x, window.innerWidth - rect.width - 8)
    const top = Math.min(y, window.innerHeight - rect.height - 8)
    setPos({ left: Math.max(8, left), top: Math.max(8, top) })
  }, [x, y, items])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onScroll = () => onClose()
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('contextmenu', onDown, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('contextmenu', onDown, true)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={ref}
      className="ctx-menu"
      style={{ left: pos.left, top: pos.top }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) =>
        item.type === 'sep' ? (
          <div key={`sep-${i}`} className="ctx-menu__sep" role="separator" />
        ) : (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className={`ctx-menu__item${item.danger ? ' is-danger' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return
              onSelect(item.id)
              onClose()
            }}
          >
            {item.icon ? <Icon name={item.icon} /> : <span className="ctx-menu__icon" aria-hidden />}
            <span className="ctx-menu__label">{item.label}</span>
          </button>
        ),
      )}
    </div>,
    document.body,
  )
}
