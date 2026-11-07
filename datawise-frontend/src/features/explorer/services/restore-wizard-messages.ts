export type RestoreWizardMessageKind =
    | 'contextMissing'
    | 'readFailed'
    | 'guestDenied'
    | 'done'
    | 'failed'

/** i18n keys for restore-wizard errors / success (production approval uses console.*). */
export function resolveRestoreWizardMessageKey(kind: RestoreWizardMessageKind): string {
    if (kind === 'contextMissing') return 'explorer.restoreWizardContextMissing'
    if (kind === 'readFailed') return 'explorer.restoreWizardReadFailed'
    if (kind === 'guestDenied') return 'explorer.restoreWizard.guestDenied'
    if (kind === 'done') return 'explorer.restoreWizardDone'
    return 'explorer.restoreWizardFailed'
}
