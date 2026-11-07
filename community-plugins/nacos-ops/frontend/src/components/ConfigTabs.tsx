import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { ContextMenu, type CtxItem } from './ContextMenu'

type TabItem = {
  id: string
  title: string
  subtitle?: string
  dirty?: boolean
  loading?: boolean
}

type Labels = {
  close: string
  closeOthers: string
  closeRight: string
  closeAll: string
  prev: string
  next: string
}

type Props = {
  tabs: TabItem[]
  activeId: string | null
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onCloseOthers: (id: string) => void
  onCloseRight: (id: string) => void
  onCloseAll: () => void
  labels: Labels
}

export function ConfigTabs({
  tabs,
  activeId,
  onActivate,
  onClose,
  onCloseOthers,
  onCloseRight,
  onCloseAll,
  labels,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; tabId: string } | null>(null)

  const updateOverflow = () => {
    const el = scrollerRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setCanPrev(el.scrollLeft > 2)
    setCanNext(max - el.scrollLeft > 2)
  }

  useLayoutEffect(() => {
    updateOverflow()
  }, [tabs, activeId])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const onScroll = () => updateOverflow()
    el.addEventListener('scroll', onScroll, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateOverflow) : null
    ro?.observe(el)
    window.addEventListener('resize', updateOverflow)
    return () => {
      el.removeEventListener('scroll', onScroll)
      ro?.disconnect()
      window.removeEventListener('resize', updateOverflow)
    }
  }, [])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el || !activeId) return
    const escape =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape
        : (v: string) => v.replace(/["\\]/g, '\\$&')
    const node = el.querySelector<HTMLElement>(`[data-tab-id="${escape(activeId)}"]`)
    if (!node) return
    const nodeRect = node.getBoundingClientRect()
    const elRect = el.getBoundingClientRect()
    const left = nodeRect.left - elRect.left + el.scrollLeft
    const right = left + node.offsetWidth
    const viewLeft = el.scrollLeft
    const viewRight = viewLeft + el.clientWidth
    if (left < viewLeft) el.scrollTo({ left, behavior: 'smooth' })
    else if (right > viewRight) el.scrollTo({ left: right - el.clientWidth, behavior: 'smooth' })
    window.setTimeout(updateOverflow, 220)
  }, [activeId, tabs.length])

  if (tabs.length === 0) return null

  const scrollByDir = (dir: -1 | 1) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.55), behavior: 'smooth' })
  }

  const openMenu = (e: ReactMouseEvent, tabId: string) => {
    e.preventDefault()
    e.stopPropagation()
    onActivate(tabId)
    setMenu({ x: e.clientX, y: e.clientY, tabId })
  }

  const menuItems = (tabId: string): CtxItem[] => {
    const idx = tabs.findIndex((tab) => tab.id === tabId)
    return [
      { type: 'item', id: 'close', label: labels.close, icon: 'close' },
      { type: 'item', id: 'closeOthers', label: labels.closeOthers, icon: 'closeOthers', disabled: tabs.length <= 1 },
      { type: 'item', id: 'closeRight', label: labels.closeRight, icon: 'closeRight', disabled: idx < 0 || idx >= tabs.length - 1 },
      { type: 'sep' },
      { type: 'item', id: 'closeAll', label: labels.closeAll, icon: 'closeAll' },
    ]
  }

  return (
    <div className={`cfg-tabs ${canPrev || canNext ? 'has-overflow' : ''}`} role="tablist" aria-label="open configs">
      <button
        type="button"
        className="cfg-tabs__nav cfg-tabs__nav--prev"
        aria-label={labels.prev}
        title={labels.prev}
        disabled={!canPrev}
        onClick={() => scrollByDir(-1)}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M6.4 1.8 3.2 5 6.4 8.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="cfg-tabs__scroll" ref={scrollerRef}>
        {tabs.map((tab) => {
          const active = tab.id === activeId
          return (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              role="tab"
              aria-selected={active}
              className={`cfg-tabs__tab ${active ? 'is-active' : ''} ${tab.dirty ? 'is-dirty' : ''} ${tab.loading ? 'is-loading' : ''}`}
              title={tab.subtitle ? `${tab.title} · ${tab.subtitle}` : tab.title}
              onClick={() => onActivate(tab.id)}
              onContextMenu={(e) => openMenu(e, tab.id)}
            >
              {tab.dirty ? <span className="cfg-tabs__dot" aria-hidden /> : null}
              <span className="cfg-tabs__title">{tab.title}</span>
              <button
                type="button"
                className="cfg-tabs__close"
                aria-label={labels.close}
                title={labels.close}
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(tab.id)
                }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                  <path d="M2.2 2.2 7.8 7.8M7.8 2.2 2.2 7.8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        className="cfg-tabs__nav cfg-tabs__nav--next"
        aria-label={labels.next}
        title={labels.next}
        disabled={!canNext}
        onClick={() => scrollByDir(1)}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M3.6 1.8 6.8 5 3.6 8.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.tabId)}
          onClose={() => setMenu(null)}
          onSelect={(id) => {
            if (id === 'close') onClose(menu.tabId)
            else if (id === 'closeOthers') onCloseOthers(menu.tabId)
            else if (id === 'closeRight') onCloseRight(menu.tabId)
            else if (id === 'closeAll') onCloseAll()
          }}
        />
      ) : null}
    </div>
  )
}
