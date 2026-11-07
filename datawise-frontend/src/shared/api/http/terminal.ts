import type {TerminalApi, TerminalExecResult, TerminalStatus} from '@/shared/api/types'
import type {TerminalStatusDto} from '@/shared/api/generated'
import {getJson, postJson} from '@/shared/api/http/request'
import {API_PATHS} from '@/shared/api/http/paths'

function mapStatus(wire: TerminalStatusDto): TerminalStatus {
    return {
        websocketEnabled: Boolean(wire.websocketEnabled),
        ptyAvailable: Boolean(wire.ptyAvailable),
        websocketPath: String(wire.websocketPath ?? ''),
    }
}

/** Terminal HTTP client — status wire type from OpenAPI (`TerminalStatusDto`). */
export function createHttpTerminalApi(): TerminalApi {
    return {
        execute: async (input, ctx) =>
            postJson<TerminalExecResult>(API_PATHS.terminal.execute, {
                input,
                cwd: ctx.cwd,
                platform: ctx.platform,
            }),

        welcome: async (platform) => {
            const data = await getJson<string>(API_PATHS.terminal.welcome, {platform})
            return data
        },

        status: async () => mapStatus(await getJson<TerminalStatusDto>(API_PATHS.terminal.status)),
    }
}
