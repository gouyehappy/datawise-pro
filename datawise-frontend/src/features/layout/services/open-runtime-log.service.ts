import {readDatawiseHost} from '@/features/layout/services/desktop-bridge'

export type OpenRuntimeLogError = 'missing' | 'open_failed' | 'unsupported'

export interface OpenRuntimeLogResult {
    ok: boolean
    path?: string
    error?: OpenRuntimeLogError
}

export async function openRuntimeLog(): Promise<OpenRuntimeLogResult> {
    const logs = readDatawiseHost()?.logs
    if (!logs?.openRuntime) {
        return {ok: false, error: 'unsupported'}
    }
    return logs.openRuntime()
}

export function canOpenRuntimeLog(): boolean {
    return Boolean(readDatawiseHost()?.logs?.openRuntime)
}
