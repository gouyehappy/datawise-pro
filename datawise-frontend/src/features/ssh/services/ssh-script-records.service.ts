import type {SshScriptRecord} from '@/features/ssh/types/ssh-script-record.types'
import {postJson, deleteJson, getJson} from '@/shared/api/http/request'
import {API_PATHS} from '@/shared/api/http/paths'
import {repairSshScriptRecords} from '@/features/ssh/services/ssh-builtin-defaults.service'

export async function listSshScriptRecords(connectionId: string): Promise<SshScriptRecord[]> {
    const records = await getJson<SshScriptRecord[]>(API_PATHS.ssh.scriptRecords(connectionId))
    return repairSshScriptRecords(Array.isArray(records) ? records : [])
}

export async function saveSshScriptRecord(
    connectionId: string,
    record: SshScriptRecord,
): Promise<SshScriptRecord> {
    return postJson<SshScriptRecord>(API_PATHS.ssh.scriptRecordsSave, {
        connectionId,
        entry: {
            ...record,
            updatedAt: Date.now(),
        },
    })
}

export async function deleteSshScriptRecord(connectionId: string, recordId: string): Promise<void> {
    await deleteJson(API_PATHS.ssh.scriptRecordDelete(connectionId, recordId))
}
