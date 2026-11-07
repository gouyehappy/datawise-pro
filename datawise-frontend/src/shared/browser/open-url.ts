import {isNativeDesktopHost, readDatawiseHost} from '@/shared/browser/desktop-bridge'

export type OpenHttpLinksIn = 'builtin' | 'system'

const HTTP_URL_RE = /^https?:\/\//i

let preference: OpenHttpLinksIn = 'builtin'
let clickDelegationInstalled = false

export function isHttpUrl(url: string | null | undefined): boolean {
    return !!url && HTTP_URL_RE.test(url.trim())
}

export function getOpenHttpLinksIn(): OpenHttpLinksIn {
    return preference
}

export function syncOpenHttpLinksIn(value: OpenHttpLinksIn | null | undefined): void {
    preference = value === 'system' ? 'system' : 'builtin'
    // Keep CEF LifeSpanHandler in sync so Markdown target=_blank popups use the OS browser.
    if (isNativeDesktopHost()) {
        const setMode = readDatawiseHost()?.shell?.setOpenHttpLinksIn
        if (typeof setMode === 'function') {
            void setMode(preference).catch(() => {
                /* ignore bridge failures */
            })
        }
    }
}

export function normalizeOpenHttpLinksIn(raw: unknown): OpenHttpLinksIn {
    return raw === 'system' ? 'system' : 'builtin'
}

/** Open http(s) in the built-in CEF window or the OS default browser. */
export async function openUrl(url: string | null | undefined): Promise<boolean> {
    const trimmed = url?.trim() ?? ''
    if (!isHttpUrl(trimmed)) return false

    if (preference === 'system' && isNativeDesktopHost()) {
        const openExternal = readDatawiseHost()?.shell?.openExternal
        if (typeof openExternal === 'function') {
            try {
                await openExternal(trimmed)
                return true
            } catch {
                /* fall through to built-in */
            }
        }
    }

    window.open(trimmed, '_blank', 'noopener,noreferrer')
    return true
}

/**
 * When preference is "system", intercept http(s) anchors that would otherwise
 * spawn a CEF popup (`target=_blank` / ctrl-click). Markdown preview relies on this
 * plus the desktop LifeSpanHandler.
 */
export function installOpenUrlClickDelegation(): void {
    if (clickDelegationInstalled || typeof document === 'undefined') return
    clickDelegationInstalled = true
    document.addEventListener(
        'click',
        (event) => {
            if (preference !== 'system' || !isNativeDesktopHost()) return
            if (event.button !== 0) return
            const target = event.target
            if (!(target instanceof Element)) return
            const anchor = target.closest('a[href]')
            if (!(anchor instanceof HTMLAnchorElement)) return
            const href = (anchor.getAttribute('href') || anchor.href || '').trim()
            // Prefer absolute resolved href for openExternal.
            const absolute = anchor.href?.trim() || href
            if (!isHttpUrl(absolute) && !isHttpUrl(href)) return
            const wantsNewContext =
                anchor.target === '_blank'
                || event.metaKey
                || event.ctrlKey
                || event.shiftKey
                || event.altKey
            // In-app same-tab anchors (e.g. #heading) — leave alone.
            if (!wantsNewContext && absolute.startsWith(window.location.origin) && absolute.includes('#')) {
                return
            }
            if (!wantsNewContext && (!anchor.target || anchor.target === '_self')) {
                // Plain in-document navigation without _blank — leave alone unless http external.
                try {
                    const url = new URL(absolute)
                    if (url.origin === window.location.origin) return
                } catch {
                    return
                }
            }
            event.preventDefault()
            event.stopPropagation()
            event.stopImmediatePropagation()
            void openUrl(absolute)
        },
        true,
    )
}
