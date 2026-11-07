import {defineFeature} from '@/core/feature-contract'
import type {LazyViewLoader} from '@/core/registry/create-lazy-view'
import type {WorkspaceTabType} from '@/core/types'

type TabEntry = {type: WorkspaceTabType; loader: LazyViewLoader; asyncName?: string}

const K8S_TABS: TabEntry[] = [
    {
        type: 'k8s-pods',
        loader: () => import('./components/tabs/K8sPodsTab.vue'),
        asyncName: 'K8sPodsTab',
    },
    {type: 'k8s-deployments', loader: () => import('./components/tabs/K8sDeploymentsTab.vue')},
    {type: 'k8s-services', loader: () => import('./components/tabs/K8sServicesTab.vue')},
    {type: 'k8s-events', loader: () => import('./components/tabs/K8sEventsTab.vue')},
    {type: 'k8s-configmaps', loader: () => import('./components/tabs/K8sConfigMapsTab.vue')},
    {type: 'k8s-secrets', loader: () => import('./components/tabs/K8sSecretsTab.vue')},
    {type: 'k8s-apply', loader: () => import('./components/tabs/K8sApplyTab.vue')},
    {type: 'k8s-crds', loader: () => import('./components/tabs/K8sCrdsTab.vue')},
    {type: 'k8s-helm', loader: () => import('./components/tabs/K8sHelmTab.vue')},
    {
        type: 'k8s-exec',
        loader: () => import('./components/tabs/K8sExecTab.vue'),
        asyncName: 'K8sExecTab',
    },
]

/**
 * Host Kubernetes workbench tabs — Feature Contract A-15 S4.
 * Coexists with community K8s plugins; does not remove host tabs (X-01/X-02).
 * KeepAlive: K8sPodsTab / K8sExecTab.
 */
export const kubernetesFeature = defineFeature({
    id: 'workspace-kubernetes',
    contributes: {
        tabs: K8S_TABS.map(({type, loader, asyncName}) => ({type, loader, asyncName})),
    },
})
