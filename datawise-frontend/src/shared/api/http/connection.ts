import type {ConnectionApi, ConnectionTestResult} from '@/shared/api/types'
import type {ConnectionTestResult as WireConnectionTestResult} from '@/shared/api/generated'
import {postJson} from '@/shared/api/http/request'
import {API_PATHS} from '@/shared/api/http/paths'

function mapTestResult(wire: WireConnectionTestResult): ConnectionTestResult {
    return {
        ok: Boolean(wire.ok),
        message: String(wire.message ?? ''),
        latencyMs: Number(wire.latencyMs ?? 0),
    }
}

/** Connection HTTP client — test result wire type from OpenAPI. */
export function createHttpConnectionApi(): ConnectionApi {
    return {
        test: async (config) =>
            mapTestResult(
                await postJson<WireConnectionTestResult>(API_PATHS.connection.test, config, {
                    silent: true,
                    timeoutMs: config.dbType === 'ssh' ? 90_000 : undefined,
                }),
            ),
    }
}
