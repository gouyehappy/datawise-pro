import {getJson, postJson, deleteJson} from '@/shared/api/http/request'
import {API_PATHS} from '@/shared/api/http/paths'

export interface WriteUnlockStatus {
    connectionId: string
    durationSec: number
    createdAt: string
    expiresAt: string
    remainingSec: number
}

export async function fetchWriteUnlockStatus(connectionId: string): Promise<WriteUnlockStatus | null> {
    try {
        return await getJson<WriteUnlockStatus>(API_PATHS.connection.writeUnlock(connectionId), {
            silent: true,
        })
    } catch {
        // 404 / not unlocked / offline → treat as locked
        return null
    }
}

export async function requestWriteUnlock(
    connectionId: string,
    durationSec: 60 | 300,
): Promise<WriteUnlockStatus> {
    return postJson<WriteUnlockStatus>(API_PATHS.connection.writeUnlock(connectionId), {
        durationSec,
    })
}

export async function clearWriteUnlock(connectionId: string): Promise<void> {
    await deleteJson(API_PATHS.connection.writeUnlock(connectionId), {silent: true})
}

/** Logout / page unload: drop all UI unlock windows for the current user. */
export async function clearAllWriteUnlocks(): Promise<void> {
    await deleteJson(API_PATHS.connection.writeUnlockAll, {silent: true})
}
