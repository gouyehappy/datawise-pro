import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { ConfirmDialog, type ConfirmOptions } from '../components/ConfirmDialog'

type AskConfirm = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmCtx = createContext<AskConfirm | null>(null)

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void }

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const pendingRef = useRef<Pending | null>(null)

  const askConfirm = useCallback<AskConfirm>((opts) => {
    return new Promise<boolean>((resolve) => {
      const next = { ...opts, resolve }
      pendingRef.current = next
      setPending(next)
    })
  }, [])

  const finish = useCallback((ok: boolean) => {
    const cur = pendingRef.current
    pendingRef.current = null
    setPending(null)
    cur?.resolve(ok)
  }, [])

  const value = useMemo(() => askConfirm, [askConfirm])

  return (
    <ConfirmCtx.Provider value={value}>
      {children}
      <ConfirmDialog
        open={Boolean(pending)}
        title={pending?.title}
        message={pending?.message || ''}
        confirmLabel={pending?.confirmLabel}
        cancelLabel={pending?.cancelLabel}
        danger={pending?.danger}
        onConfirm={() => finish(true)}
        onCancel={() => finish(false)}
      />
    </ConfirmCtx.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmCtx)
  if (!ctx) throw new Error('useConfirm requires ConfirmProvider')
  return ctx
}
