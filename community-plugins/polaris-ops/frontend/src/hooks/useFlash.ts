import { useCallback, useEffect, useRef, useState } from 'react'

/** Single floating toast with timer coalescing. */
export function useFlash(durationMs = 2500) {
  const [toast, setToast] = useState('')
  const timerRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current)
    },
    [],
  )

  const flash = useCallback(
    (msg: string) => {
      setToast(msg)
      if (timerRef.current != null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        setToast('')
        timerRef.current = null
      }, durationMs)
    },
    [durationMs],
  )

  const clearToast = useCallback(() => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current)
    timerRef.current = null
    setToast('')
  }, [])

  return { toast, flash, clearToast }
}
