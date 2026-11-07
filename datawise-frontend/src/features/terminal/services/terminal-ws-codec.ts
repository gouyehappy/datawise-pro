import type {TerminalOutputChunk} from '@/features/terminal/services/native-terminal.types'

/** Collapse CRLF/LF to CR so PTY / vim do not see double newlines on paste. */
export function normalizePtyInput(text: string): string {
    return text.replace(/\r\n/g, '\r').replace(/\n/g, '\r')
}

export function decodeBase64ToBytes(b64: string): Uint8Array {
    const binary = atob(b64)
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
        out[i] = binary.charCodeAt(i)
    }
    return out
}

/** Decode a terminal WS output frame (base64 preferred, legacy UTF-8 string fallback). */
export function decodeTerminalWsOutput(
    data: string | undefined,
    encoding?: string,
): TerminalOutputChunk | null {
    if (!data) return null
    if (encoding === 'base64') {
        try {
            return decodeBase64ToBytes(data)
        } catch {
            return null
        }
    }
    return data
}
