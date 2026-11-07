import {describe, expect, it} from 'vitest'
import type {WorkspaceTab} from '@/core/types'
import {
    findYarnWorkbenchTab,
    planOpenConfigCenter,
    planOpenElasticsearchConsole,
    planOpenK8sExec,
    planOpenK8sResourceTab,
    planOpenYarnApplications,
} from '@/features/workspace/services/workspace-platform-open.service'

function tab(partial: Partial<WorkspaceTab> & Pick<WorkspaceTab, 'id' | 'title' | 'type'>): WorkspaceTab {
    return {closable: true, ...partial}
}

describe('workspace-platform-open.service', () => {
    it('planOpenElasticsearchConsole reuses and patches view/index/metadata', () => {
        const existing = tab({
            id: 'es-1',
            title: 'ES',
            type: 'elasticsearch-console',
            connectionId: 'c1',
            params: {elasticsearchView: 'documents'},
        })
        const decision = planOpenElasticsearchConsole([existing], {
            connectionId: 'c1',
            view: 'rest',
            indexName: 'orders',
            metadataKind: 'mapping',
        })
        expect(decision).toEqual({
            reuse: existing,
            patches: {
                params: {
                    elasticsearchView: 'rest',
                    elasticsearchMetadataKind: 'mapping',
                },
                tableName: 'orders',
            },
        })
    })

    it('planOpenYarnApplications reuses any yarn workbench tab and switches view', () => {
        const nodes = tab({
            id: 'yarn-1',
            title: 'YARN',
            type: 'yarn-nodes',
            connectionId: 'y1',
            params: {yarnView: 'nodes'},
        })
        expect(findYarnWorkbenchTab([nodes], 'y1')).toBe(nodes)

        const decision = planOpenYarnApplications([nodes], {
            connectionId: 'y1',
            connectionLabel: 'cluster-a',
            yarnAppFilterId: 'app-1',
        })
        expect(decision).toMatchObject({
            reuse: nodes,
            patches: {
                params: {
                    yarnView: 'applications',
                    yarnAppFilterId: 'app-1',
                },
                title: 'cluster-a',
            },
        })
    })

    it('planOpenConfigCenter reuses nacos/polaris workbench across view types', () => {
        const nacos = tab({
            id: 'nacos-1',
            title: 'Nacos',
            type: 'nacos-services',
            connectionId: 'n1',
            dbType: 'nacos',
            params: {nacosView: 'services'},
        })
        const decision = planOpenConfigCenter(
            [nacos],
            {connectionId: 'n1', connectionLabel: 'prod'},
            'nacos',
            'configs',
        )
        expect(decision).toMatchObject({
            reuse: nacos,
            patches: {params: {nacosView: 'configs'}, title: 'prod'},
        })
    })

    it('planOpenK8sResourceTab creates; planOpenK8sExec always creates', () => {
        const create = planOpenK8sResourceTab([], 'k8s-deployments', 'explorer.k8sDeployments', {
            connectionId: 'k1',
            connectionLabel: 'prod',
            namespace: 'default',
        })
        expect('create' in create && create.create).toMatchObject({
            type: 'k8s-deployments',
            connectionId: 'k1',
            dbType: 'kubernetes',
            params: {k8sNamespace: 'default'},
        })

        const exec = planOpenK8sExec([], {
            connectionId: 'k1',
            connectionLabel: 'prod',
            namespace: 'ns',
            podName: 'api-0',
            container: 'main',
        })
        expect('create' in exec && exec.create).toMatchObject({
            type: 'k8s-exec',
            connectionId: 'k1',
            params: {
                k8sNamespace: 'ns',
                k8sPodName: 'api-0',
                k8sContainer: 'main',
            },
        })
        if ('create' in exec) expect(exec.create.title).toContain('api-0')
    })
})
