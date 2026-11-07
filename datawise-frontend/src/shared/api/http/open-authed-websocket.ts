/**
 * Browser WebSocket auth via Sec-WebSocket-Protocol only.
 * Never put session ids in the URL (?dwSession=) — they leak to proxies, logs, and Referer.
 */
export function openAuthedWebSocket(url: string): WebSocket {
    const sessionId =
        typeof localStorage !== 'undefined' ? localStorage.getItem('dw-cli-session-id') : null
    if (sessionId?.trim()) {
        return new WebSocket(url, [sessionId.trim()])
    }
    return new WebSocket(url)
}
