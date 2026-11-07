export type ExplorerFeatureMessageKind =
    | 'kafkaPublishContextMissing'
    | 'tableMigrationContextMissing'
    | 'metadocContextMissing'
    | 'metadocFailed'
    | 'metadocTabTitle'
    | 'runSqlFileFailed'
    | 'loadSqlFileFailed'
    | 'lineageMissingContext'
    | 'createNamespaceAccessDenied'
    | 'createNamespaceCopyFailed'
    | 'refreshDone'
    | 'productionApprovalSubmitted'

/** i18n keys for explorer feature opens / refresh / namespace actions. */
export function resolveExplorerFeatureMessageKey(kind: ExplorerFeatureMessageKind): string {
    if (kind === 'kafkaPublishContextMissing') return 'explorer.kafkaTablePublish.contextMissing'
    if (kind === 'tableMigrationContextMissing') return 'explorer.tableMigrationContextMissing'
    if (kind === 'metadocContextMissing') return 'explorer.metadocContextMissing'
    if (kind === 'metadocFailed') return 'explorer.metadocFailed'
    if (kind === 'metadocTabTitle') return 'workspace.metadoc.tabTitle'
    if (kind === 'runSqlFileFailed') return 'explorer.runSqlFileFailed'
    if (kind === 'loadSqlFileFailed') return 'console.loadSqlFileFailed'
    if (kind === 'lineageMissingContext') return 'lineage.missingContext'
    if (kind === 'createNamespaceAccessDenied') return 'explorer.createNamespace.accessDenied'
    if (kind === 'createNamespaceCopyFailed') return 'explorer.createNamespace.copyFailed'
    if (kind === 'productionApprovalSubmitted') return 'console.productionApproval.submitted'
    return 'explorer.refreshDone'
}
