const EVENT = 'datawise:ssh-script-records-changed'

export function notifySshScriptRecordsChanged(connectionId: string) {
    if (!connectionId) return
    window.dispatchEvent(new CustomEvent(EVENT, {detail: {connectionId}}))
}

export function onSshScriptRecordsChanged(
    handler: (connectionId: string) => void,
): () => void {
    const listener = (event: Event) => {
        const connectionId = (event as CustomEvent<{connectionId?: string}>).detail?.connectionId
        if (typeof connectionId === 'string' && connectionId) {
            handler(connectionId)
        }
    }
    window.addEventListener(EVENT, listener)
    return () => window.removeEventListener(EVENT, listener)
}
