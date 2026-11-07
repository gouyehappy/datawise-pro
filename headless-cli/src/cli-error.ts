import {DatawiseApiError} from './client.js'

/** Map backend governance errors to actionable CLI messages. */
export function formatCliError(error: unknown): string {
    if (error instanceof DatawiseApiError) {
        const code = error.errorCode ?? ''
        const msg = error.message
        if (code === 'SQL_PRODUCTION_APPROVAL_REQUIRED' || msg.includes('SQL_PRODUCTION_APPROVAL_REQUIRED')) {
            return [
                'Production write blocked: shared production connections require team approval.',
                'Submit an approval in the DataWise UI (Team → Production SQL approvals), or use a non-prod connection.',
                'See docs/GOVERNANCE.md.',
            ].join(' ')
        }
        if (code === 'CONNECTION_ACCESS_DENIED' || msg.includes('CONNECTION_ACCESS_DENIED')) {
            return [
                'Connection access denied for this API token user.',
                'Team-shared connections honor readonly / readwrite / ddl — check shared access in Team settings.',
                'List visible connections: datawise sql connections',
            ].join(' ')
        }
        return msg
    }
    if (error instanceof Error) {
        return error.message
    }
    return String(error)
}
