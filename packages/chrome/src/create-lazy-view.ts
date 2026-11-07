/**
 * Shared async view factory — loading / error shells use `useDwI18n` (no vue-i18n).
 */
import {
  defineAsyncComponent,
  defineComponent,
  h,
  type AsyncComponentLoader,
  type Component,
} from 'vue'
import {useDwI18n} from '@datawise/ui'

export type LazyViewLoader = AsyncComponentLoader

const DEFAULT_TIMEOUT_MS = 60_000

const shellStyle = {
  position: 'absolute',
  inset: '0',
  zIndex: '1',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '14px',
  width: '100%',
  height: '100%',
  minHeight: '100%',
  background: 'var(--dw-bg-editor)',
  color: 'var(--dw-text-secondary)',
  fontSize: 'var(--dw-text-md)',
  textAlign: 'center',
  boxSizing: 'border-box',
  padding: '24px',
} as const

const spinnerStyle = {
  width: '28px',
  height: '28px',
  border: '2px solid color-mix(in srgb, var(--dw-primary) 22%, transparent)',
  borderTopColor: 'var(--dw-primary)',
  borderRadius: '50%',
  animation: 'dw-panel-async-spin 0.75s linear infinite',
} as const

/** Ensure spinner keyframes once; safe to call repeatedly. */
function ensureAsyncSpinKeyframes(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById('dw-panel-async-spin-style')) return
  const style = document.createElement('style')
  style.id = 'dw-panel-async-spin-style'
  style.textContent = '@keyframes dw-panel-async-spin{to{transform:rotate(360deg)}}'
  document.head.appendChild(style)
}

export const PanelLoadingShell = defineComponent({
  name: 'PanelLoadingShell',
  setup() {
    ensureAsyncSpinKeyframes()
    const t = useDwI18n()
    const label = t('common.panelLoading')
    return () =>
      h(
        'div',
        {
          class: 'panel-loading-shell',
          role: 'status',
          'aria-live': 'polite',
          'aria-busy': 'true',
          'aria-label': label,
          style: shellStyle,
        },
        [
          h('span', {
            class: 'panel-loading-shell__spinner',
            'aria-hidden': 'true',
            style: spinnerStyle,
          }),
          h('div', {style: {fontWeight: '500', color: 'var(--dw-text-secondary)'}}, label),
        ],
      )
  },
})

export const PanelLoadError = defineComponent({
  name: 'PanelLoadError',
  setup() {
    const t = useDwI18n()
    const title = t('common.panelLoadFailedTitle')
    const hint = t('common.panelLoadFailedHint')
    const reloadLabel = t('common.reload')
    return () =>
      h(
        'div',
        {
          class: 'panel-load-error',
          role: 'alert',
          style: shellStyle,
        },
        [
          h('div', {style: {fontWeight: '600', color: 'var(--dw-danger)'}}, title),
          h(
            'div',
            {
              style: {
                maxWidth: '420px',
                color: 'var(--dw-text-secondary)',
                fontSize: 'var(--dw-text-sm)',
              },
            },
            hint,
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'panel-load-error__reload',
              style: {
                marginTop: '8px',
                padding: '6px 12px',
                borderRadius: 'var(--dw-control-radius, 6px)',
                border: '1px solid var(--dw-border)',
                background: 'var(--dw-bg-panel)',
                color: 'var(--dw-text)',
                cursor: 'pointer',
              },
              onClick: () => {
                if (typeof window !== 'undefined') window.location.reload()
              },
            },
            reloadLabel,
          ),
        ],
      )
  },
})

export function createLazyView(
  loader: LazyViewLoader,
  options?: {timeout?: number; name?: string},
): Component {
  const component = defineAsyncComponent({
    loader,
    loadingComponent: PanelLoadingShell,
    errorComponent: PanelLoadError,
    /** Vue default delay=200ms; zero avoids a blank frame on slow nets */
    delay: 0,
    timeout: options?.timeout ?? DEFAULT_TIMEOUT_MS,
  })
  if (options?.name && typeof component === 'object' && component !== null) {
    ;(component as {name?: string}).name = options.name
  }
  return component
}

/** Prefetch chunks while idle to cut first-open wait. */
export async function prefetchLazyLoaders(
  loaders: Array<LazyViewLoader | null | undefined>,
): Promise<void> {
  const jobs = loaders.filter((loader): loader is LazyViewLoader => typeof loader === 'function')
  if (jobs.length === 0) return
  await Promise.allSettled(jobs.map((loader) => loader()))
}

export function scheduleIdleWarmup(task: () => void, timeoutMs = 2_500): void {
  if (typeof window === 'undefined') {
    task()
    return
  }
  const ric = window.requestIdleCallback
  if (typeof ric === 'function') {
    ric(() => task(), {timeout: timeoutMs})
    return
  }
  window.setTimeout(task, Math.min(800, timeoutMs))
}
