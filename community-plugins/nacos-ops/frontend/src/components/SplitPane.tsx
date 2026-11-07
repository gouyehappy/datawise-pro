import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

type Props = {
  left: ReactNode
  right: ReactNode
  defaultWidth?: number
  minWidth?: number
  maxWidth?: number
}

export function SplitPane({
  left,
  right,
  defaultWidth = 360,
  minWidth = 220,
  maxWidth = 640,
}: Props) {
  const root = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(defaultWidth)
  const dragging = useRef(false)

  const onMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging.current || !root.current) return
      const rect = root.current.getBoundingClientRect()
      const max = Math.min(maxWidth, rect.width - 200)
      const next = Math.max(minWidth, Math.min(max, e.clientX - rect.left))
      setWidth(Math.round(next))
    },
    [maxWidth, minWidth],
  )

  const onUp = useCallback(() => {
    dragging.current = false
    document.body.classList.remove('ops-split-dragging')
  }, [])

  useEffect(() => {
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [onMove, onUp])

  return (
    <div className="split" ref={root}>
      <div className="split__start" style={{ width }}>
        {left}
      </div>
      <div
        className="split__handle"
        onPointerDown={(e) => {
          e.preventDefault()
          dragging.current = true
          document.body.classList.add('ops-split-dragging')
          ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
        }}
      />
      <div className="split__end">{right}</div>
    </div>
  )
}
