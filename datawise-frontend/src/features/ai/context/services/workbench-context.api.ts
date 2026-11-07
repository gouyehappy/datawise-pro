import {getJson, postJson, putJson} from '@/shared/api/http/request'
import {API_PATHS} from '@/shared/api/http/paths'
import type {WorkbenchContextSnapshot} from '@/features/ai/context/types/workbench-context.types'

const WRITE_OPTS = {timeoutMs: 8_000} as const

export async function fetchWorkbenchContext(
    includeBodyPreview = true,
): Promise<WorkbenchContextSnapshot> {
    const qs = includeBodyPreview ? '' : '?includeBodyPreview=false'
    return getJson<WorkbenchContextSnapshot>(`${API_PATHS.platform.workbenchContext}${qs}`)
}

export async function publishWorkbenchContext(snapshot: WorkbenchContextSnapshot): Promise<void> {
    await putJson<void>(API_PATHS.platform.workbenchContext, snapshot, WRITE_OPTS)
}

export async function heartbeatWorkbenchContext(): Promise<void> {
    await postJson<void>(API_PATHS.platform.workbenchContextHeartbeat, {}, WRITE_OPTS)
}
