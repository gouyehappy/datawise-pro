export type ViewModelMessageKind =
    | 'loadFailed'
    | 'deleteMessage'
    | 'invalidName'
    | 'renameFailed'
    | 'renamed'
    | 'deleted'
    | 'deleteFailed'

/** i18n keys for explorer view-model open / rename / delete toasts. */
export function resolveViewModelMessageKey(kind: ViewModelMessageKind): string {
    if (kind === 'loadFailed') return 'viewModel.loadFailed'
    if (kind === 'deleteMessage') return 'viewModel.deleteMessage'
    if (kind === 'invalidName') return 'viewModel.invalidName'
    if (kind === 'renameFailed') return 'viewModel.renameFailed'
    if (kind === 'renamed') return 'viewModel.renamed'
    if (kind === 'deleted') return 'viewModel.deleted'
    return 'viewModel.deleteFailed'
}
