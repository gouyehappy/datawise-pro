export type SshScriptRecordMessageKind =
    | 'newRecord'
    | 'loadFailed'
    | 'createFailed'
    | 'deleteConfirm'
    | 'deleteSuccess'
    | 'deleteFailed'
    | 'renameSuccess'
    | 'saveFailed'

/** i18n keys for SSH script-record CRUD / confirm dialogs. */
export function resolveSshScriptRecordMessageKey(kind: SshScriptRecordMessageKind): string {
    if (kind === 'newRecord') return 'ssh.scriptRecord.newRecord'
    if (kind === 'loadFailed') return 'ssh.scriptRecord.loadFailed'
    if (kind === 'createFailed') return 'ssh.scriptRecord.createFailed'
    if (kind === 'deleteConfirm') return 'ssh.scriptRecord.deleteConfirm'
    if (kind === 'deleteSuccess') return 'ssh.scriptRecord.deleteSuccess'
    if (kind === 'deleteFailed') return 'ssh.scriptRecord.deleteFailed'
    if (kind === 'renameSuccess') return 'ssh.scriptRecord.renameSuccess'
    return 'ssh.scriptRecord.saveFailed'
}
