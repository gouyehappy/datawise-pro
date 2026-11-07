/**
 * Pure find/reuse + create-payload helpers for platform connector workspace tabs
 * (Elasticsearch, YARN, Jenkins, Nacos/Polaris config-center, Kubernetes).
 * Store methods apply mutations (tabs / activeTabId / touch) after these decisions.
 */
import type {WorkspaceTab, WorkspaceTabType} from '@/core/types'
import {t} from '@/i18n'
import type {
    ConnectionOpenBase,
    StatelessOpenDecision,
} from '@/features/workspace/services/workspace-stateless-open.service'

function labeledTitle(
    label: string | undefined,
    tabTitleKey: string,
    plainTitleKey: string,
): string {
    return label ? t(tabTitleKey, {name: label}) : t(plainTitleKey)
}

function plainOrLabel(label: string | undefined, plainTitleKey: string): string {
    return label || t(plainTitleKey)
}

function findByTypeAndConnection(
    tabs: WorkspaceTab[],
    type: WorkspaceTabType,
    connectionId: string,
): WorkspaceTab | undefined {
    return tabs.find((tab) => tab.type === type && tab.connectionId === connectionId)
}

// --- Elasticsearch ---

export function planOpenElasticsearchConsole(
    tabs: WorkspaceTab[],
    options: ConnectionOpenBase & {
        view?: 'rest' | 'documents'
        indexName?: string
        metadataKind?: 'all' | 'mapping' | 'settings' | 'stats'
    },
): StatelessOpenDecision {
    const view = options.view ?? 'documents'
    const existing = findByTypeAndConnection(tabs, 'elasticsearch-console', options.connectionId)
    if (existing) {
        const patches: Partial<WorkspaceTab> = {
            params: {
                elasticsearchView: view,
                elasticsearchMetadataKind: options.metadataKind,
            },
        }
        if (options.indexName) patches.tableName = options.indexName
        if (options.explorerNodeId) patches.explorerNodeId = options.explorerNodeId
        return {reuse: existing, patches}
    }

    return {
        create: {
            title: labeledTitle(
                options.connectionLabel,
                'explorer.elasticsearchConsole.tabTitle',
                'explorer.elasticsearchConsole.title',
            ),
            type: 'elasticsearch-console',
            closable: true,
            connectionId: options.connectionId,
            dbType: 'elasticsearch',
            explorerNodeId: options.explorerNodeId,
            tableName: options.indexName,
            params: {
                elasticsearchView: view,
                elasticsearchMetadataKind: options.metadataKind,
            },
        },
    }
}

// --- YARN ---

export function findYarnWorkbenchTab(
    tabs: WorkspaceTab[],
    connectionId: string,
): WorkspaceTab | undefined {
    return tabs.find(
        (tab) =>
            (tab.type === 'yarn-applications' || tab.type === 'yarn-nodes' || tab.type === 'yarn-queues')
            && tab.connectionId === connectionId,
    )
}

function planOpenYarnView(
    tabs: WorkspaceTab[],
    options: ConnectionOpenBase & {yarnAppFilterId?: string},
    view: 'applications' | 'nodes' | 'queues',
): StatelessOpenDecision {
    const titleKey =
        view === 'applications'
            ? 'explorer.yarnApps.title'
            : view === 'nodes'
                ? 'explorer.yarnNodes.title'
                : 'explorer.yarnQueues.title'
    const createType: WorkspaceTabType =
        view === 'applications'
            ? 'yarn-applications'
            : view === 'nodes'
                ? 'yarn-nodes'
                : 'yarn-queues'

    const existing = findYarnWorkbenchTab(tabs, options.connectionId)
    if (existing) {
        const patches: Partial<WorkspaceTab> = {
            title: plainOrLabel(options.connectionLabel, titleKey),
            params: {
                yarnView: view,
                ...(view === 'applications' && options.yarnAppFilterId
                    ? {yarnAppFilterId: options.yarnAppFilterId}
                    : {}),
            },
        }
        if (options.explorerNodeId) patches.explorerNodeId = options.explorerNodeId
        return {reuse: existing, patches}
    }

    return {
        create: {
            title: plainOrLabel(options.connectionLabel, titleKey),
            type: createType,
            closable: true,
            connectionId: options.connectionId,
            dbType: 'yarn',
            explorerNodeId: options.explorerNodeId,
            params: {
                yarnView: view,
                yarnAppFilterId: view === 'applications' ? options.yarnAppFilterId : undefined,
            },
        },
    }
}

export function planOpenYarnApplications(
    tabs: WorkspaceTab[],
    options: ConnectionOpenBase & {yarnAppFilterId?: string},
): StatelessOpenDecision {
    return planOpenYarnView(tabs, options, 'applications')
}

export function planOpenYarnNodes(
    tabs: WorkspaceTab[],
    options: ConnectionOpenBase,
): StatelessOpenDecision {
    return planOpenYarnView(tabs, options, 'nodes')
}

export function planOpenYarnQueues(
    tabs: WorkspaceTab[],
    options: ConnectionOpenBase,
): StatelessOpenDecision {
    return planOpenYarnView(tabs, options, 'queues')
}

// --- Jenkins ---

export function findJenkinsWorkbenchTab(
    tabs: WorkspaceTab[],
    connectionId: string,
): WorkspaceTab | undefined {
    return tabs.find(
        (tab) =>
            (tab.type === 'jenkins-jobs' || tab.type === 'jenkins-nodes')
            && tab.connectionId === connectionId,
    )
}

function planOpenJenkinsView(
    tabs: WorkspaceTab[],
    options: ConnectionOpenBase & {jenkinsJobFilterName?: string},
    view: 'jobs' | 'nodes',
): StatelessOpenDecision {
    const titleKey = view === 'jobs' ? 'explorer.jenkinsJobs.title' : 'explorer.jenkinsNodes.title'
    const createType: WorkspaceTabType = view === 'jobs' ? 'jenkins-jobs' : 'jenkins-nodes'

    const existing = findJenkinsWorkbenchTab(tabs, options.connectionId)
    if (existing) {
        const patches: Partial<WorkspaceTab> = {
            title: plainOrLabel(options.connectionLabel, titleKey),
            params: {
                jenkinsView: view,
                ...(view === 'jobs' && options.jenkinsJobFilterName
                    ? {jenkinsJobFilterName: options.jenkinsJobFilterName}
                    : {}),
            },
        }
        if (options.explorerNodeId) patches.explorerNodeId = options.explorerNodeId
        return {reuse: existing, patches}
    }

    return {
        create: {
            title: plainOrLabel(options.connectionLabel, titleKey),
            type: createType,
            closable: true,
            connectionId: options.connectionId,
            dbType: 'jenkins',
            explorerNodeId: options.explorerNodeId,
            params: {
                jenkinsView: view,
                jenkinsJobFilterName: view === 'jobs' ? options.jenkinsJobFilterName : undefined,
            },
        },
    }
}

export function planOpenJenkinsJobs(
    tabs: WorkspaceTab[],
    options: ConnectionOpenBase & {jenkinsJobFilterName?: string},
): StatelessOpenDecision {
    return planOpenJenkinsView(tabs, options, 'jobs')
}

export function planOpenJenkinsNodes(
    tabs: WorkspaceTab[],
    options: ConnectionOpenBase,
): StatelessOpenDecision {
    return planOpenJenkinsView(tabs, options, 'nodes')
}

// --- Config center (Nacos / Polaris) ---

export type ConfigCenterKind = 'nacos' | 'polaris'

export function findConfigCenterWorkbenchTab(
    tabs: WorkspaceTab[],
    connectionId: string,
    kind: ConfigCenterKind,
): WorkspaceTab | undefined {
    if (kind === 'nacos') {
        return tabs.find(
            (tab) =>
                (tab.type === 'nacos-configs' || tab.type === 'nacos-services')
                && tab.connectionId === connectionId,
        )
    }
    return tabs.find(
        (tab) =>
            (tab.type === 'polaris-configs' || tab.type === 'polaris-services')
            && tab.connectionId === connectionId,
    )
}

export type ConfigCenterOpenOptions = ConnectionOpenBase & {namespace?: string}

/** Bound helpers for openWithPlan (view is fixed; namespace stays on options). */
export function planOpenNacosConfigs(
    tabs: WorkspaceTab[],
    options: ConfigCenterOpenOptions,
): StatelessOpenDecision {
    return planOpenConfigCenter(tabs, options, 'nacos', 'configs')
}

export function planOpenNacosServices(
    tabs: WorkspaceTab[],
    options: ConfigCenterOpenOptions,
): StatelessOpenDecision {
    return planOpenConfigCenter(tabs, options, 'nacos', 'services')
}

export function planOpenPolarisConfigs(
    tabs: WorkspaceTab[],
    options: ConfigCenterOpenOptions,
): StatelessOpenDecision {
    return planOpenConfigCenter(tabs, options, 'polaris', 'configs')
}

export function planOpenPolarisServices(
    tabs: WorkspaceTab[],
    options: ConfigCenterOpenOptions,
): StatelessOpenDecision {
    return planOpenConfigCenter(tabs, options, 'polaris', 'services')
}

export function planOpenConfigCenter(
    tabs: WorkspaceTab[],
    options: ConfigCenterOpenOptions,
    kind: ConfigCenterKind,
    view: 'configs' | 'services',
): StatelessOpenDecision {
    const titleKey =
        kind === 'nacos' ? 'explorer.nacosConfigs.title' : 'explorer.polarisConfigs.title'
    const existing = findConfigCenterWorkbenchTab(tabs, options.connectionId, kind)
    if (existing) {
        const patches: Partial<WorkspaceTab> = {
            title: plainOrLabel(options.connectionLabel, titleKey),
            params:
                kind === 'nacos'
                    ? {
                        nacosView: view,
                        ...(options.namespace !== undefined ? {nacosNamespace: options.namespace} : {}),
                    }
                    : {
                        polarisView: view,
                        ...(options.namespace !== undefined
                            ? {polarisNamespace: options.namespace}
                            : {}),
                    },
        }
        if (options.explorerNodeId) patches.explorerNodeId = options.explorerNodeId
        return {reuse: existing, patches}
    }

    if (kind === 'nacos') {
        return {
            create: {
                title: plainOrLabel(options.connectionLabel, titleKey),
                type: 'nacos-configs',
                closable: true,
                connectionId: options.connectionId,
                dbType: 'nacos',
                explorerNodeId: options.explorerNodeId,
                params: {nacosView: view, nacosNamespace: options.namespace},
            },
        }
    }

    return {
        create: {
            title: plainOrLabel(options.connectionLabel, titleKey),
            type: 'polaris-configs',
            closable: true,
            connectionId: options.connectionId,
            dbType: 'polaris',
            explorerNodeId: options.explorerNodeId,
            params: {polarisView: view, polarisNamespace: options.namespace},
        },
    }
}

// --- Kubernetes ---

export type K8sResourceTabType =
    | 'k8s-deployments'
    | 'k8s-services'
    | 'k8s-events'
    | 'k8s-configmaps'
    | 'k8s-secrets'
    | 'k8s-apply'
    | 'k8s-crds'
    | 'k8s-helm'

export function planOpenK8sPods(
    tabs: WorkspaceTab[],
    options: ConnectionOpenBase & {namespace?: string},
): StatelessOpenDecision {
    const existing = findByTypeAndConnection(tabs, 'k8s-pods', options.connectionId)
    if (existing) {
        const patches: Partial<WorkspaceTab> = {}
        if (options.namespace !== undefined) patches.params = {k8sNamespace: options.namespace}
        if (options.explorerNodeId) patches.explorerNodeId = options.explorerNodeId
        return {reuse: existing, patches: Object.keys(patches).length ? patches : undefined}
    }

    return {
        create: {
            title: labeledTitle(
                options.connectionLabel,
                'explorer.k8sPods.tabTitle',
                'explorer.k8sPods.title',
            ),
            type: 'k8s-pods',
            closable: true,
            connectionId: options.connectionId,
            dbType: 'kubernetes',
            explorerNodeId: options.explorerNodeId,
            params: {k8sNamespace: options.namespace},
        },
    }
}

export function planOpenK8sResourceTab(
    tabs: WorkspaceTab[],
    type: K8sResourceTabType,
    i18nPrefix: string,
    options: ConnectionOpenBase & {namespace?: string},
): StatelessOpenDecision {
    const existing = findByTypeAndConnection(tabs, type, options.connectionId)
    if (existing) {
        const patches: Partial<WorkspaceTab> = {}
        if (options.namespace !== undefined) patches.params = {k8sNamespace: options.namespace}
        if (options.explorerNodeId) patches.explorerNodeId = options.explorerNodeId
        return {reuse: existing, patches: Object.keys(patches).length ? patches : undefined}
    }

    return {
        create: {
            title: labeledTitle(
                options.connectionLabel,
                `${i18nPrefix}.tabTitle`,
                `${i18nPrefix}.title`,
            ),
            type,
            closable: true,
            connectionId: options.connectionId,
            dbType: 'kubernetes',
            explorerNodeId: options.explorerNodeId,
            params: {k8sNamespace: options.namespace},
        },
    }
}

export function planOpenK8sExec(
    _tabs: WorkspaceTab[],
    options: ConnectionOpenBase & {
        namespace: string
        podName: string
        container?: string
    },
): StatelessOpenDecision {
    const name = options.connectionLabel || options.connectionId
    return {
        create: {
            title: t('explorer.k8sExec.tabTitle', {
                name,
                pod: `${options.namespace}/${options.podName}`,
            }),
            type: 'k8s-exec',
            closable: true,
            connectionId: options.connectionId,
            dbType: 'kubernetes',
            explorerNodeId: options.explorerNodeId,
            params: {
                k8sNamespace: options.namespace,
                k8sPodName: options.podName,
                k8sContainer: options.container,
            },
        },
    }
}

/** Bound helpers for openWithPlan (resource tabs share planOpenK8sResourceTab). */
export function planOpenK8sDeployments(
    tabs: WorkspaceTab[],
    options: ConnectionOpenBase & {namespace?: string},
): StatelessOpenDecision {
    return planOpenK8sResourceTab(tabs, 'k8s-deployments', 'explorer.k8sDeployments', options)
}

export function planOpenK8sServices(
    tabs: WorkspaceTab[],
    options: ConnectionOpenBase & {namespace?: string},
): StatelessOpenDecision {
    return planOpenK8sResourceTab(tabs, 'k8s-services', 'explorer.k8sServices', options)
}

export function planOpenK8sEvents(
    tabs: WorkspaceTab[],
    options: ConnectionOpenBase & {namespace?: string},
): StatelessOpenDecision {
    return planOpenK8sResourceTab(tabs, 'k8s-events', 'explorer.k8sEvents', options)
}

export function planOpenK8sConfigMaps(
    tabs: WorkspaceTab[],
    options: ConnectionOpenBase & {namespace?: string},
): StatelessOpenDecision {
    return planOpenK8sResourceTab(tabs, 'k8s-configmaps', 'explorer.k8sConfigMaps', options)
}

export function planOpenK8sSecrets(
    tabs: WorkspaceTab[],
    options: ConnectionOpenBase & {namespace?: string},
): StatelessOpenDecision {
    return planOpenK8sResourceTab(tabs, 'k8s-secrets', 'explorer.k8sSecrets', options)
}

export function planOpenK8sApply(
    tabs: WorkspaceTab[],
    options: ConnectionOpenBase & {namespace?: string},
): StatelessOpenDecision {
    return planOpenK8sResourceTab(tabs, 'k8s-apply', 'explorer.k8sApply', options)
}

export function planOpenK8sCrds(
    tabs: WorkspaceTab[],
    options: ConnectionOpenBase,
): StatelessOpenDecision {
    return planOpenK8sResourceTab(tabs, 'k8s-crds', 'explorer.k8sCrds', options)
}

export function planOpenK8sHelm(
    tabs: WorkspaceTab[],
    options: ConnectionOpenBase & {namespace?: string},
): StatelessOpenDecision {
    return planOpenK8sResourceTab(tabs, 'k8s-helm', 'explorer.k8sHelm', options)
}
