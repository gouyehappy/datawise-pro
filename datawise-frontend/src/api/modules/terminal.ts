import {api} from '@/shared/api'
import type {TerminalShellContext} from '@/shared/api/types'

export const terminalApi = {
    welcome: (platform: string) => api.terminal.welcome(platform),
    execute: (input: string, ctx: TerminalShellContext) =>
        api.terminal.execute(input, ctx),
    status: () => api.terminal.status(),
}
