import {readDatawiseHost} from '@/shared/browser/desktop-bridge'

export type ClipboardHost = {
    readText?: () => Promise<string>
    writeText?: (text: string) => Promise<boolean | void>
}

export type ClipboardDeps = {
    hostClipboard?: () => ClipboardHost | undefined
    browserClipboard?: () => Clipboard | undefined
    execCopy?: (text: string) => boolean
}

function isClipboardDenied(error: unknown): boolean {
    if (!(error instanceof DOMException)) return false
    return error.name === 'NotAllowedError' || error.name === 'SecurityError'
}

function fallbackExecCopy(text: string): boolean {
    try {
        const area = document.createElement('textarea')
        area.value = text
        area.setAttribute('readonly', '')
        area.style.position = 'fixed'
        area.style.left = '-9999px'
        area.style.top = '0'
        document.body.appendChild(area)
        area.select()
        const ok = document.execCommand('copy')
        area.remove()
        return ok
    } catch {
        return false
    }
}

function resolveHostClipboard(deps?: ClipboardDeps): ClipboardHost | undefined {
    if (deps?.hostClipboard) return deps.hostClipboard()
    return readDatawiseHost()?.clipboard
}

function resolveBrowserClipboard(deps?: ClipboardDeps): Clipboard | undefined {
    if (deps?.browserClipboard) return deps.browserClipboard()
    return typeof navigator !== 'undefined' ? navigator.clipboard : undefined
}

/** Desktop bridge or Clipboard API can write text. */
export function canWriteClipboard(deps?: ClipboardDeps): boolean {
    const host = resolveHostClipboard(deps)
    const browser = resolveBrowserClipboard(deps)
    return Boolean(host?.writeText || browser?.writeText)
}

/** Desktop bridge or Clipboard API can read text. Prefer bridge on JCEF. */
export function canReadClipboard(deps?: ClipboardDeps): boolean {
    const host = resolveHostClipboard(deps)
    const browser = resolveBrowserClipboard(deps)
    return Boolean(host?.readText || browser?.readText)
}

/** Write text: desktop bridge → Clipboard API → execCommand. */
export async function writeClipboardText(text: string, deps?: ClipboardDeps): Promise<boolean> {
    const host = resolveHostClipboard(deps)
    if (host?.writeText) {
        try {
            await host.writeText(text)
            return true
        } catch {
            /* fall through */
        }
    }
    const browser = resolveBrowserClipboard(deps)
    if (browser?.writeText) {
        try {
            await browser.writeText(text)
            return true
        } catch (error) {
            if (!isClipboardDenied(error)) {
                /* still try fallback */
            }
        }
    }
    const execCopy = deps?.execCopy ?? fallbackExecCopy
    return execCopy(text)
}

/** Read text: desktop bridge → Clipboard API. Returns null when unavailable. */
export async function readClipboardText(deps?: ClipboardDeps): Promise<string | null> {
    const host = resolveHostClipboard(deps)
    if (host?.readText) {
        try {
            const text = await host.readText()
            return text ?? ''
        } catch {
            /* fall through */
        }
    }
    const browser = resolveBrowserClipboard(deps)
    if (browser?.readText) {
        try {
            return await browser.readText()
        } catch {
            return null
        }
    }
    return null
}
