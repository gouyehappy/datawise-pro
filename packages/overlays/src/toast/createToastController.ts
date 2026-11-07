import {computed, reactive, type ComputedRef} from 'vue'

export type ToastVariant = 'info' | 'success' | 'warning' | 'error'

/** Normalized internal action (always `run`). */
export type ToastAction = {
  label: string
  run: () => void
}

/** Accept either host-style `onClick` or package-style `run`. */
export type ToastActionInput = {
  label: string
  onClick?: () => void
  run?: () => void
}

export type ToastShowOptions = {
  variant?: ToastVariant
  durationMs?: number
  action?: ToastActionInput
}

export type ToastState = {
  message: string | null
  variant: ToastVariant
  action: ToastAction | null
}

export type ToastController = {
  message: ComputedRef<string | null>
  variant: ComputedRef<ToastVariant>
  action: ComputedRef<ToastAction | null>
  show: (message: string, options?: ToastVariant | ToastShowOptions) => void
  success: (message: string, durationMs?: number) => void
  error: (message: string, durationMs?: number) => void
  warning: (message: string, durationMs?: number) => void
  dismiss: () => void
  runAction: () => void
  withAction: (
    message: string,
    action: ToastActionInput,
    variant?: ToastVariant,
    durationMs?: number,
  ) => void
}

const DEFAULT_DURATION_MS: Record<ToastVariant, number> = {
  info: 2800,
  success: 2800,
  warning: 5000,
  error: 8000,
}

export function normalizeToastAction(action: ToastActionInput): ToastAction {
  const run = action.run ?? action.onClick ?? (() => undefined)
  return {label: action.label, run}
}

/**
 * Pinia-free toast controller for framework hosts / playground.
 */
export function createToastController(options?: {
  /** Default auto-dismiss ms when call omits durationMs; 0 = sticky until dismiss */
  durationMs?: number
}): ToastController {
  const defaultDurationMs = options?.durationMs
  const state = reactive<ToastState>({
    message: null,
    variant: 'info',
    action: null,
  })
  let timer: ReturnType<typeof setTimeout> | null = null
  let activeKey = ''

  function clearTimer() {
    if (timer != null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function resolveDuration(variant: ToastVariant, override?: number): number {
    if (override != null) return override
    if (defaultDurationMs != null) return defaultDurationMs
    return DEFAULT_DURATION_MS[variant]
  }

  function scheduleDismiss(variant: ToastVariant, durationOverride?: number, key?: string) {
    clearTimer()
    const ms = resolveDuration(variant, durationOverride)
    if (ms <= 0) return
    const dismissKey = key ?? activeKey
    timer = setTimeout(() => {
      if (activeKey === dismissKey) {
        state.message = null
        state.action = null
        activeKey = ''
      }
      timer = null
    }, ms)
  }

  function present(
    message: string,
    variant: ToastVariant,
    action: ToastAction | null,
    durationMs?: number,
  ) {
    const trimmed = message.trim()
    const key = `${variant}:${trimmed}:${action?.label ?? ''}`
    state.message = trimmed
    state.variant = variant
    state.action = action
    activeKey = key
    scheduleDismiss(variant, durationMs, key)
  }

  function show(message: string, options?: ToastVariant | ToastShowOptions) {
    let variant: ToastVariant = 'info'
    let durationMs: number | undefined
    let action: ToastAction | null = null

    if (typeof options === 'string') {
      variant = options
    } else if (options) {
      variant = options.variant ?? 'info'
      durationMs = options.durationMs
      action = options.action ? normalizeToastAction(options.action) : null
    }

    present(message, variant, action, durationMs)
  }

  return {
    message: computed(() => state.message),
    variant: computed(() => state.variant),
    action: computed(() => state.action),
    show,
    success: (message, durationMs) =>
      show(message, {variant: 'success', durationMs}),
    error: (message, durationMs) =>
      show(message, {variant: 'error', durationMs}),
    warning: (message, durationMs) =>
      show(message, {variant: 'warning', durationMs}),
    dismiss: () => {
      clearTimer()
      state.message = null
      state.action = null
      activeKey = ''
    },
    runAction: () => {
      const act = state.action
      state.message = null
      state.action = null
      activeKey = ''
      clearTimer()
      act?.run()
    },
    withAction: (message, action, variant = 'info', durationMs) => {
      present(message, variant, normalizeToastAction(action), durationMs)
    },
  }
}
