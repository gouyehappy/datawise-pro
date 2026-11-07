import type {DbType, TreeNode} from '@/core/types'
import {parseJenkinsFeatureId} from '@/features/explorer/services/jenkins-feature-tree.service'
import {parseNacosFeatureId} from '@/features/explorer/services/nacos-feature-tree.service'
import {parseNacosNamespaceNodeId} from '@/features/explorer/services/nacos-namespace-tree.service'
import {parsePolarisNamespaceNodeId} from '@/features/explorer/services/polaris-namespace-tree.service'
import {parsePolarisFeatureId} from '@/features/explorer/services/polaris-feature-tree.service'
import {parseK8sNamespaceNodeId} from '@/features/explorer/services/k8s-namespace-tree.service'
import {parseK8sFeatureId} from '@/features/explorer/services/k8s-feature-tree.service'
import {parseKafkaFeatureId} from '@/features/explorer/services/kafka-feature-tree.service'
import {parseRedisFeatureId} from '@/features/explorer/services/redis-feature-tree.service'
import {parseElasticsearchFeatureId} from '@/features/explorer/services/elasticsearch-feature-tree.service'
import {parseYarnFeatureId} from '@/features/explorer/services/yarn-feature-tree.service'
import {
    planOpenElasticsearchConsole,
    planOpenJenkinsJobs,
    planOpenJenkinsNodes,
    planOpenK8sApply,
    planOpenK8sConfigMaps,
    planOpenK8sCrds,
    planOpenK8sDeployments,
    planOpenK8sEvents,
    planOpenK8sHelm,
    planOpenK8sPods,
    planOpenK8sSecrets,
    planOpenK8sServices,
    planOpenKafkaConsumerGroups,
    planOpenKafkaTopics,
    planOpenNacosConfigs,
    planOpenNacosServices,
    planOpenPolarisConfigs,
    planOpenPolarisServices,
    planOpenRedisConsole,
    planOpenYarnApplications,
    planOpenYarnNodes,
    planOpenYarnQueues,
    planOpenKafkaTablePublish,
    planOpenSshTerminal,
    useWorkspaceStore,
} from '@/features/workspace'

export type PlatformConnectionMenuOpen =
    | {kind: 'redis-console'; view: 'keys' | 'command'}
    | {kind: 'elasticsearch-console'; view: 'rest' | 'documents'}
    | {kind: 'kafka-topics'}
    | {kind: 'kafka-consumer-groups'}
    | {kind: 'yarn-applications'}
    | {kind: 'yarn-nodes'}
    | {kind: 'yarn-queues'}
    | {kind: 'jenkins-jobs'}
    | {kind: 'jenkins-nodes'}
    | {kind: 'nacos-configs'; namespace?: string}
    | {kind: 'nacos-services'; namespace?: string}
    | {kind: 'polaris-services'; namespace?: string}
    | {kind: 'polaris-configs'; namespace?: string}
    | {kind: 'k8s-pods'; namespace?: string}
    | {kind: 'k8s-deployments'; namespace?: string}
    | {kind: 'k8s-services'; namespace?: string}
    | {kind: 'k8s-events'; namespace?: string}
    | {kind: 'k8s-configmaps'; namespace?: string}
    | {kind: 'k8s-secrets'; namespace?: string}
    | {kind: 'k8s-apply'; namespace?: string}
    | {kind: 'k8s-crds'}
    | {kind: 'k8s-helm'; namespace?: string}
    /** Open SSH from the connection node itself (label = node.label). */
    | {kind: 'ssh-terminal'}
    /**
     * new-ssh-terminal: connection id may come from the node or its parent;
     * connection name should be looked up (not taken from node.label blindly).
     */
    | {kind: 'ssh-terminal-new'}

type PlatformMenuNode = Pick<TreeNode, 'type' | 'dbType'>

function isConnectionOf(
    node: PlatformMenuNode,
    dbType: DbType,
): boolean {
    return node.type === 'connection' && node.dbType === dbType
}

/**
 * Pure matcher for platform-connection context-menu open actions.
 * Returns null when the menu id is not a platform open action for this node.
 */
export function resolvePlatformConnectionMenuOpen(
    menuId: string,
    node: PlatformMenuNode,
): PlatformConnectionMenuOpen | null {
    if (menuId === 'open-redis-workbench' && isConnectionOf(node, 'redis')) {
        return {kind: 'redis-console', view: 'keys'}
    }
    if (menuId === 'open-redis-browser' && isConnectionOf(node, 'redis')) {
        return {kind: 'redis-console', view: 'keys'}
    }
    if (menuId === 'open-redis-keys' && isConnectionOf(node, 'redis')) {
        return {kind: 'redis-console', view: 'keys'}
    }
    if (menuId === 'open-redis-command' && isConnectionOf(node, 'redis')) {
        return {kind: 'redis-console', view: 'command'}
    }
    if (menuId === 'redis-console' && isConnectionOf(node, 'redis')) {
        return {kind: 'redis-console', view: 'keys'}
    }
    if (menuId === 'open-elasticsearch-workbench' && isConnectionOf(node, 'elasticsearch')) {
        return {kind: 'elasticsearch-console', view: 'documents'}
    }
    if (menuId === 'open-elasticsearch-rest' && isConnectionOf(node, 'elasticsearch')) {
        return {kind: 'elasticsearch-console', view: 'rest'}
    }
    if (menuId === 'open-elasticsearch-documents' && isConnectionOf(node, 'elasticsearch')) {
        return {kind: 'elasticsearch-console', view: 'documents'}
    }

    if (menuId === 'open-kafka-workbench' && isConnectionOf(node, 'kafka')) {
        return {kind: 'kafka-topics'}
    }
    if (menuId === 'open-kafka-topics' && isConnectionOf(node, 'kafka')) {
        return {kind: 'kafka-topics'}
    }
    if (menuId === 'kafka-console' && isConnectionOf(node, 'kafka')) {
        return {kind: 'kafka-topics'}
    }
    if (menuId === 'open-kafka-consumer-groups' && isConnectionOf(node, 'kafka')) {
        return {kind: 'kafka-consumer-groups'}
    }

    if (menuId === 'open-yarn-workbench' && isConnectionOf(node, 'yarn')) {
        return {kind: 'yarn-applications'}
    }
    if (menuId === 'open-yarn-applications' && isConnectionOf(node, 'yarn')) {
        return {kind: 'yarn-applications'}
    }
    if (menuId === 'open-yarn-nodes' && isConnectionOf(node, 'yarn')) {
        return {kind: 'yarn-nodes'}
    }
    if (menuId === 'open-yarn-queues' && isConnectionOf(node, 'yarn')) {
        return {kind: 'yarn-queues'}
    }

    if (menuId === 'open-jenkins-workbench' && isConnectionOf(node, 'jenkins')) {
        return {kind: 'jenkins-jobs'}
    }
    if (menuId === 'open-jenkins-jobs' && isConnectionOf(node, 'jenkins')) {
        return {kind: 'jenkins-jobs'}
    }
    if (menuId === 'open-jenkins-nodes' && isConnectionOf(node, 'jenkins')) {
        return {kind: 'jenkins-nodes'}
    }

    if (menuId === 'open-nacos-configs' && isConnectionOf(node, 'nacos')) {
        return {kind: 'nacos-configs'}
    }
    if (menuId === 'open-nacos-services' && isConnectionOf(node, 'nacos')) {
        return {kind: 'nacos-services'}
    }
    if (menuId === 'open-polaris-services' && isConnectionOf(node, 'polaris')) {
        return {kind: 'polaris-services'}
    }
    if (menuId === 'open-polaris-configs' && isConnectionOf(node, 'polaris')) {
        return {kind: 'polaris-configs'}
    }

    if (menuId === 'open-k8s-pods' && isConnectionOf(node, 'kubernetes')) {
        return {kind: 'k8s-pods'}
    }
    if (menuId === 'open-k8s-deployments' && isConnectionOf(node, 'kubernetes')) {
        return {kind: 'k8s-deployments'}
    }
    if (menuId === 'open-k8s-services' && isConnectionOf(node, 'kubernetes')) {
        return {kind: 'k8s-services'}
    }
    if (menuId === 'open-k8s-events' && isConnectionOf(node, 'kubernetes')) {
        return {kind: 'k8s-events'}
    }
    if (menuId === 'open-k8s-configmaps' && isConnectionOf(node, 'kubernetes')) {
        return {kind: 'k8s-configmaps'}
    }
    if (menuId === 'open-k8s-secrets' && isConnectionOf(node, 'kubernetes')) {
        return {kind: 'k8s-secrets'}
    }
    if (menuId === 'open-k8s-apply' && isConnectionOf(node, 'kubernetes')) {
        return {kind: 'k8s-apply'}
    }
    if (menuId === 'open-k8s-crds' && isConnectionOf(node, 'kubernetes')) {
        return {kind: 'k8s-crds'}
    }
    if (menuId === 'open-k8s-helm' && isConnectionOf(node, 'kubernetes')) {
        return {kind: 'k8s-helm'}
    }

    if (menuId === 'open-ssh-terminal' && isConnectionOf(node, 'ssh')) {
        return {kind: 'ssh-terminal'}
    }
    // JDBC tunnel menu is available on JDBC connections (no dbType === 'ssh' gate).
    if (menuId === 'open-jdbc-ssh-tunnel' && node.type === 'connection') {
        return {kind: 'ssh-terminal'}
    }
    if (
        menuId === 'new-ssh-terminal'
        && (node.type === 'connection' || node.type === 'ssh-terminal')
        && node.dbType === 'ssh'
    ) {
        return {kind: 'ssh-terminal-new'}
    }

    return null
}

/** Resolve connection id for {@link PlatformConnectionMenuOpen} `ssh-terminal-new`. */
export function resolveNewSshTerminalConnectionId(
    node: Pick<TreeNode, 'type' | 'id'>,
    parentConnectionId: string | undefined,
): string {
    if (node.type === 'connection') return node.id
    return parentConnectionId ?? ''
}

export type PlatformFeatureNodeOpen =
    | {kind: 'redis-console'; view: 'keys' | 'command'}
    | {kind: 'elasticsearch-console'; view: 'rest' | 'documents'}
    | {kind: 'kafka-topics'}
    | {kind: 'kafka-consumer-groups'}
    | {kind: 'kafka-table-publish'}
    | {kind: 'yarn-applications'}
    | {kind: 'yarn-nodes'}
    | {kind: 'yarn-queues'}
    | {kind: 'jenkins-jobs'}
    | {kind: 'jenkins-nodes'}
    | {kind: 'nacos-configs'; namespace?: string}
    | {kind: 'nacos-services'; namespace?: string}
    | {kind: 'polaris-services'; namespace?: string}
    | {kind: 'polaris-configs'; namespace?: string}
    | {kind: 'k8s-pods'; namespace?: string}
    | {kind: 'k8s-deployments'; namespace?: string}
    | {kind: 'k8s-services'; namespace?: string}
    | {kind: 'k8s-events'; namespace?: string}
    | {kind: 'k8s-configmaps'; namespace?: string}
    | {kind: 'k8s-secrets'; namespace?: string}
    | {kind: 'k8s-apply'; namespace?: string}
    | {kind: 'k8s-crds'}
    | {kind: 'k8s-helm'; namespace?: string}

/** Pure matcher for double-click / open on platform feature tree nodes. */
export function resolvePlatformFeatureNodeOpen(
    node: Pick<TreeNode, 'type' | 'label' | 'meta'>,
): PlatformFeatureNodeOpen | null {
    if (node.type === 'redis-feature') {
        const feature = parseRedisFeatureId(node)
        if (feature === 'workbench' || feature === 'keys') return {kind: 'redis-console', view: 'keys'}
        if (feature === 'command') return {kind: 'redis-console', view: 'command'}
        return null
    }
    if (node.type === 'elasticsearch-feature') {
        const feature = parseElasticsearchFeatureId(node)
        if (feature === 'workbench' || feature === 'documents') return {kind: 'elasticsearch-console', view: 'documents'}
        if (feature === 'rest-console') return {kind: 'elasticsearch-console', view: 'rest'}
        return null
    }
    if (node.type === 'kafka-feature') {
        const feature = parseKafkaFeatureId(node)
        if (feature === 'workbench' || feature === 'topics') return {kind: 'kafka-topics'}
        if (feature === 'consumer-groups') return {kind: 'kafka-consumer-groups'}
        if (feature === 'table-publish') return {kind: 'kafka-table-publish'}
        return null
    }
    if (node.type === 'yarn-feature') {
        const feature = parseYarnFeatureId(node)
        if (feature === 'workbench' || feature === 'applications') return {kind: 'yarn-applications'}
        if (feature === 'nodes') return {kind: 'yarn-nodes'}
        if (feature === 'queues') return {kind: 'yarn-queues'}
        return null
    }
    if (node.type === 'jenkins-feature') {
        const feature = parseJenkinsFeatureId(node)
        if (feature === 'workbench' || feature === 'jobs') return {kind: 'jenkins-jobs'}
        if (feature === 'nodes') return {kind: 'jenkins-nodes'}
        return null
    }
    if (node.type === 'nacos-feature') {
        const feature = parseNacosFeatureId(node)
        if (feature === 'configs') return {kind: 'nacos-configs'}
        if (feature === 'services') return {kind: 'nacos-services'}
        return null
    }
    if (node.type === 'nacos-namespace') {
        const namespace = parseNacosNamespaceNodeId(node)
        if (namespace == null) return null
        return {kind: 'nacos-configs', namespace}
    }
    if (node.type === 'polaris-feature') {
        const feature = parsePolarisFeatureId(node)
        if (feature === 'services') return {kind: 'polaris-services'}
        if (feature === 'configs') return {kind: 'polaris-configs'}
        return null
    }
    if (node.type === 'polaris-namespace') {
        const namespace = parsePolarisNamespaceNodeId(node)
        if (!namespace) return null
        return {kind: 'polaris-configs', namespace}
    }
    if (node.type === 'k8s-namespace') {
        const namespace = parseK8sNamespaceNodeId(node)
        if (!namespace) return null
        return {kind: 'k8s-pods', namespace}
    }
    if (node.type === 'k8s-feature') {
        const feature = parseK8sFeatureId(node)
        if (feature === 'pods') return {kind: 'k8s-pods'}
        if (feature === 'deployments') return {kind: 'k8s-deployments'}
        if (feature === 'services') return {kind: 'k8s-services'}
        if (feature === 'events') return {kind: 'k8s-events'}
        if (feature === 'configmaps') return {kind: 'k8s-configmaps'}
        if (feature === 'secrets') return {kind: 'k8s-secrets'}
        if (feature === 'apply') return {kind: 'k8s-apply'}
        if (feature === 'crds') return {kind: 'k8s-crds'}
        if (feature === 'helm') return {kind: 'k8s-helm'}
        return null
    }
    return null
}

export type PlatformOpenConnectionContext = {
    connectionId: string
    connectionName: string
    explorerNodeId: string
}

export type PlatformWorkspaceOpenHandlers = {
    openWithPlan: ReturnType<typeof useWorkspaceStore>['openWithPlan']
}

export function buildPlatformWorkspaceOpenHandlers(
    workspace: ReturnType<typeof useWorkspaceStore>,
): PlatformWorkspaceOpenHandlers {
    return {
        openWithPlan: (plan, options, kind) => workspace.openWithPlan(plan, options, kind),
    }
}

export type PlatformWorkspaceOpenKind = PlatformFeatureNodeOpen | PlatformConnectionMenuOpen

/** Platform menu/feature opens go through openWithPlan (incl. kafka publish + ssh — A-06b). */
export function dispatchPlatformWorkspaceOpen(
    open: PlatformWorkspaceOpenKind,
    ctx: PlatformOpenConnectionContext,
    handlers: PlatformWorkspaceOpenHandlers,
): void {
    switch (open.kind) {
        case 'redis-console':
            handlers.openWithPlan(planOpenRedisConsole, {...ctx, view: open.view}, 'redis')
            return
        case 'elasticsearch-console':
            handlers.openWithPlan(planOpenElasticsearchConsole, {...ctx, view: open.view}, 'elasticsearch')
            return
        case 'kafka-topics':
            handlers.openWithPlan(planOpenKafkaTopics, ctx, 'kafka')
            return
        case 'kafka-consumer-groups':
            handlers.openWithPlan(planOpenKafkaConsumerGroups, ctx, 'kafka')
            return
        case 'kafka-table-publish':
            handlers.openWithPlan(
                (tabs, opts) =>
                    planOpenKafkaTablePublish(tabs, {
                        kafkaConnectionId: opts.connectionId,
                        kafkaConnectionLabel: opts.connectionLabel,
                        explorerNodeId: opts.explorerNodeId,
                    }),
                ctx,
                'kafka',
            )
            return
        case 'yarn-applications':
            handlers.openWithPlan(planOpenYarnApplications, ctx, 'yarn')
            return
        case 'yarn-nodes':
            handlers.openWithPlan(planOpenYarnNodes, ctx, 'yarn')
            return
        case 'yarn-queues':
            handlers.openWithPlan(planOpenYarnQueues, ctx, 'yarn')
            return
        case 'jenkins-jobs':
            handlers.openWithPlan(planOpenJenkinsJobs, ctx, 'jenkins')
            return
        case 'jenkins-nodes':
            handlers.openWithPlan(planOpenJenkinsNodes, ctx, 'jenkins')
            return
        case 'nacos-configs':
            handlers.openWithPlan(planOpenNacosConfigs, {...ctx, namespace: open.namespace}, 'nacos')
            return
        case 'nacos-services':
            handlers.openWithPlan(planOpenNacosServices, {...ctx, namespace: open.namespace}, 'nacos')
            return
        case 'polaris-services':
            handlers.openWithPlan(planOpenPolarisServices, {...ctx, namespace: open.namespace}, 'polaris')
            return
        case 'polaris-configs':
            handlers.openWithPlan(planOpenPolarisConfigs, {...ctx, namespace: open.namespace}, 'polaris')
            return
        case 'k8s-pods':
            handlers.openWithPlan(planOpenK8sPods, {...ctx, namespace: open.namespace}, 'kubernetes')
            return
        case 'k8s-deployments':
            handlers.openWithPlan(planOpenK8sDeployments, {...ctx, namespace: open.namespace}, 'kubernetes')
            return
        case 'k8s-services':
            handlers.openWithPlan(planOpenK8sServices, {...ctx, namespace: open.namespace}, 'kubernetes')
            return
        case 'k8s-events':
            handlers.openWithPlan(planOpenK8sEvents, {...ctx, namespace: open.namespace}, 'kubernetes')
            return
        case 'k8s-configmaps':
            handlers.openWithPlan(planOpenK8sConfigMaps, {...ctx, namespace: open.namespace}, 'kubernetes')
            return
        case 'k8s-secrets':
            handlers.openWithPlan(planOpenK8sSecrets, {...ctx, namespace: open.namespace}, 'kubernetes')
            return
        case 'k8s-apply':
            handlers.openWithPlan(planOpenK8sApply, {...ctx, namespace: open.namespace}, 'kubernetes')
            return
        case 'k8s-crds':
            handlers.openWithPlan(planOpenK8sCrds, ctx, 'kubernetes')
            return
        case 'k8s-helm':
            handlers.openWithPlan(planOpenK8sHelm, {...ctx, namespace: open.namespace}, 'kubernetes')
            return
        case 'ssh-terminal':
        case 'ssh-terminal-new':
            handlers.openWithPlan(planOpenSshTerminal, ctx, 'ssh')
            return
    }
}
