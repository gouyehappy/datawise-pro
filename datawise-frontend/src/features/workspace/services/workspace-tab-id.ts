import type {WorkspaceTab} from '@/core/types'

/** Module-scoped workspace tab id generator (process-local counter). */
let tabCounter = 0

export function nextWorkspaceTabId(prefix: string): string {
    return `${prefix}-${++tabCounter}`
}

/** Current counter value (matches the numeric suffix after the latest nextWorkspaceTabId). */
export function currentWorkspaceTabCounter(): number {
    return tabCounter
}

/** Test-only: reset counter between isolated unit tests. */
export function resetWorkspaceTabIdCounterForTests(): void {
    tabCounter = 0
}

export function workspaceTabIdPrefix(type: WorkspaceTab['type']): string {
    if (type === 'console') return 'console'
    if (type === 'table') return 'table'
    if (type === 'terminal') return 'terminal'
    if (type === 'connection') return 'connection'
    if (type === 'schema-compare') return 'schema'
    if (type === 'schema-er') return 'schema-er'
    if (type === 'schema-tables') return 'schema-tables'
    if (type === 'metadoc') return 'metadoc'
    if (type === 'cross-env-compare') return 'cross-env'
    if (type === 'table-migration') return 'migration'
    if (type === 'view_model') return 'view-model'
    if (type === 'view_model_editor') return 'vm-editor'
    if (type === 'view_model_lineage') return 'lineage'
    if (type === 'redis-key') return 'redis'
    if (type === 'redis-console') return 'redis-console'
    if (type === 'elasticsearch-console') return 'elasticsearch-console'
    if (type === 'mongo-console') return 'mongo-console'
    if (type === 'kafka-topics') return 'kafka-topics'
    if (type === 'kafka-topic') return 'kafka-topic'
    if (type === 'kafka-consumer-groups') return 'kafka-consumer-groups'
    if (type === 'kafka-table-publish') return 'kafka-table-publish'
    if (type === 'yarn-applications') return 'yarn-applications'
    if (type === 'yarn-nodes') return 'yarn-nodes'
    if (type === 'yarn-queues') return 'yarn-queues'
    if (type === 'jenkins-jobs') return 'jenkins-jobs'
    if (type === 'jenkins-nodes') return 'jenkins-nodes'
    if (type === 'nacos-configs') return 'nacos-configs'
    if (type === 'nacos-services') return 'nacos-services'
    if (type === 'polaris-services') return 'polaris-services'
    if (type === 'polaris-configs') return 'polaris-configs'
    if (type === 'k8s-pods') return 'k8s-pods'
    if (type === 'k8s-deployments') return 'k8s-deployments'
    if (type === 'k8s-services') return 'k8s-services'
    if (type === 'k8s-events') return 'k8s-events'
    if (type === 'k8s-configmaps') return 'k8s-configmaps'
    if (type === 'k8s-secrets') return 'k8s-secrets'
    if (type === 'k8s-apply') return 'k8s-apply'
    if (type === 'k8s-crds') return 'k8s-crds'
    if (type === 'k8s-helm') return 'k8s-helm'
    if (type === 'k8s-exec') return 'k8s-exec'
    if (type === 'ssh-terminal') return 'ssh-terminal'
    if (type === 'ssh-script-record') return 'ssh-script-record'
    if (type === 'platform_catalog') return 'platform-catalog'
    if (type === 'data_catalog') return 'data-catalog'
    if (type === 'create-database') return 'create-database'
    if (type === 'local-text') return 'local-text'
    if (type === 'community-plugin-center') return 'community-plugin-center'
    if (type === 'community-workbench') return 'community-workbench'
    if (type === 'community-filesystem') return 'community-filesystem'
    return 'tab'
}
