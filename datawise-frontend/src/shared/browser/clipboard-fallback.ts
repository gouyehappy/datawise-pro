/** Clipboard permission denied / blocked — Monaco logs these loudly otherwise. */
function isClipboardDenied(error: unknown): boolean {
    if (!(error instanceof DOMException)) return false
    return error.name === 'NotAllowedError' || error.name === 'SecurityError'
}

function isUserActivationActive(): boolean {
    const activation = (navigator as Navigator & {
        userActivation?: {isActive?: boolean}
    }).userActivation
    return activation?.isActive === true
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

/**
 * When the Clipboard API is blocked (site permission / no user gesture),
 * fall back to execCommand. Background callers (Monaco blur sync) swallow
 * NotAllowedError so the console stays quiet; user-gesture callers still throw
 * after a failed fallback so UI toasts keep working.
 */
export function installClipboardFallback(): void {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return

    const originalWriteText = navigator.clipboard.writeText.bind(navigator.clipboard)
    navigator.clipboard.writeText = async (text: string) => {
        try {
            await originalWriteText(text)
        } catch (error) {
            if (!isClipboardDenied(error)) throw error
            if (fallbackExecCopy(text)) return
            if (!isUserActivationActive()) return
            throw error
        }
    }

    if (typeof navigator.clipboard.write !== 'function') return
    const originalWrite = navigator.clipboard.write.bind(navigator.clipboard)
    navigator.clipboard.write = async (data: ClipboardItems) => {
        try {
            await originalWrite(data)
        } catch (error) {
            if (!isClipboardDenied(error)) throw error
            for (const item of data) {
                if (!item.types.includes('text/plain')) continue
                try {
                    const blob = await item.getType('text/plain')
                    const text = await blob.text()
                    if (fallbackExecCopy(text)) return
                } catch {
                    /* try next item */
                }
            }
            if (!isUserActivationActive()) return
            throw error
        }
    }
}
