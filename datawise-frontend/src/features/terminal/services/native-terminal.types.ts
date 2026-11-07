export interface NativeTerminalCreateResult {
    ok: boolean
    shell?: string
    cwd?: string
    error?: string
}

/** Raw PTY bytes (Uint8Array) or legacy UTF-8 text chunks. */
export type TerminalOutputChunk = string | Uint8Array

export interface NativeTerminalBridge {
    create: (
        sessionId: string,
        opts?: { cols?: number; rows?: number },
    ) => Promise<NativeTerminalCreateResult>
    write: (sessionId: string, data: string) => Promise<boolean>
    resize: (sessionId: string, cols: number, rows: number) => Promise<boolean>
    destroy: (sessionId: string) => Promise<boolean>
    onOutput: (sessionId: string, callback: (data: TerminalOutputChunk) => void) => () => void
    onExit: (sessionId: string, callback: (exitCode: number) => void) => () => void
}
