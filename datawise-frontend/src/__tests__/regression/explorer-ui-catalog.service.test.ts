import assert from 'node:assert/strict'
import {describe, it, beforeEach} from 'node:test'
import {
    __setExplorerUiCatalogForTests,
    buildConnectionFeatureChildrenFromProfile,
    buildConnectionMenuOpenItemsFromProfile,
    ensureCatalogFeatureChildren,
    FALLBACK_EXPLORER_UI_PROFILES,
    getExplorerUiProfile,
    hasExplorerUiTreeFeatures,
    isExplorerUiFeatureNodeType,
    resolveDbTypeForExplorerFeatureNodeType,
} from '@/features/explorer/services/explorer-ui-catalog.service'
import type {TreeNode} from '@/core/types'

const t = ((key: string) => key) as unknown as import('vue-i18n').ComposerTranslation

describe('explorer-ui-catalog.service', () => {
    beforeEach(() => {
        __setExplorerUiCatalogForTests(null)
    })

    it('seeds platform fallback profiles including redis/kafka/ssh', () => {
        assert.deepEqual(
            getExplorerUiProfile('nacos')!.features.map((f) => f.id),
            ['configs', 'services'],
        )
        assert.deepEqual(
            getExplorerUiProfile('polaris')!.features.map((f) => f.id),
            ['services', 'configs'],
        )
        assert.deepEqual(
            getExplorerUiProfile('redis')!.features.map((f) => f.id),
            ['workbench'],
        )
        assert.ok(getExplorerUiProfile('kafka'))
        assert.ok(getExplorerUiProfile('yarn'))
        assert.ok(getExplorerUiProfile('jenkins'))
        assert.ok(getExplorerUiProfile('kubernetes'))
        assert.ok(getExplorerUiProfile('ssh'))
    })

    it('does not declare profiles for three-tier JDBC or document catalogs', () => {
        assert.equal(getExplorerUiProfile('trino'), null)
        assert.equal(getExplorerUiProfile('sqlserver'), null)
        assert.equal(getExplorerUiProfile('mysql'), null)
        assert.equal(getExplorerUiProfile('postgresql'), null)
        assert.equal(getExplorerUiProfile('mongodb'), null)
        assert.equal(getExplorerUiProfile('kudu'), null)
    })

    it('indexes feature node types for flat catalog detection', () => {
        assert.equal(hasExplorerUiTreeFeatures('kubernetes'), false)
        assert.equal(hasExplorerUiTreeFeatures('redis'), true)
        assert.equal(hasExplorerUiTreeFeatures('yarn'), true)
        assert.equal(hasExplorerUiTreeFeatures('jenkins'), true)
        assert.equal(hasExplorerUiTreeFeatures('trino'), false)
        assert.equal(hasExplorerUiTreeFeatures('mongodb'), false)
        assert.equal(isExplorerUiFeatureNodeType('k8s-feature'), false)
        assert.equal(isExplorerUiFeatureNodeType('yarn-feature'), true)
        assert.equal(isExplorerUiFeatureNodeType('jenkins-feature'), true)
        assert.equal(isExplorerUiFeatureNodeType('redis-feature'), true)
        assert.equal(isExplorerUiFeatureNodeType('ssh-terminal'), true)
        assert.equal(isExplorerUiFeatureNodeType('ssh-script-records'), true)
        assert.equal(isExplorerUiFeatureNodeType('ssh-script-record'), false)
        assert.equal(resolveDbTypeForExplorerFeatureNodeType('redis-feature'), 'redis')
        assert.equal(resolveDbTypeForExplorerFeatureNodeType('yarn-feature'), 'yarn')
        assert.equal(resolveDbTypeForExplorerFeatureNodeType('ssh-terminal'), 'ssh')
        assert.equal(resolveDbTypeForExplorerFeatureNodeType('ssh-script-records'), 'ssh')
    })

    it('builds feature children from profile', () => {
        const profile = FALLBACK_EXPLORER_UI_PROFILES.find((p) => p.dbType === 'nacos')!
        const children = buildConnectionFeatureChildrenFromProfile('conn-1', profile)
        assert.equal(children.length, 0)
        const menu = buildConnectionMenuOpenItemsFromProfile(profile, t)
        assert.deepEqual(
            menu.map((item) => item.id),
            ['open-nacos-configs', 'open-nacos-services'],
        )
    })

    it('preserves ssh historical tree node id suffixes; k8s stays menu-only', () => {
        const k8s = FALLBACK_EXPLORER_UI_PROFILES.find((p) => p.dbType === 'kubernetes')!
        const k8sChildren = buildConnectionFeatureChildrenFromProfile('k1', k8s)
        assert.equal(k8sChildren.length, 0)
        assert.equal(k8s.features[0].treeNodeIdSuffix, ':k8s:feature:pods')

        const ssh = FALLBACK_EXPLORER_UI_PROFILES.find((p) => p.dbType === 'ssh')!
        const sshChildren = buildConnectionFeatureChildrenFromProfile('ssh-1', ssh)
        assert.equal(sshChildren.length, 2)
        assert.equal(sshChildren[0].id, 'ssh-1:ssh-terminal')
        assert.equal(sshChildren[0].type, 'ssh-terminal')
        assert.equal(sshChildren[1].id, 'ssh-1:ssh:script-records')
    })

    it('omits menu-only and tree-only features correctly', () => {
        const ssh = FALLBACK_EXPLORER_UI_PROFILES.find((p) => p.dbType === 'ssh')!
        const menu = buildConnectionMenuOpenItemsFromProfile(ssh, t)
        assert.deepEqual(
            menu.map((item) => item.id),
            ['open-ssh-terminal', 'new-ssh-terminal'],
        )
        assert.equal(menu[0].icon, 'console')
    })

    it('builds connection menu open items from profile', () => {
        const profile = FALLBACK_EXPLORER_UI_PROFILES.find((p) => p.dbType === 'polaris')!
        const items = buildConnectionMenuOpenItemsFromProfile(profile, t)
        assert.deepEqual(
            items.map((item) => item.id),
            ['open-polaris-services', 'open-polaris-configs'],
        )
        assert.equal(items[0].label, 'explorer.polarisFeatures.services')
    })

    it('ensureCatalogFeatureChildren injects redis tree features and yarn workbench row', () => {
        const redis: TreeNode = {
            id: 'r1',
            label: 'Redis',
            type: 'connection',
            dbType: 'redis',
            children: [],
        }
        assert.equal(ensureCatalogFeatureChildren(redis), true)
        assert.equal(redis.children?.length, 1)
        assert.equal(redis.children?.[0].meta, 'workbench')

        const yarn: TreeNode = {
            id: 'y1',
            label: 'YARN',
            type: 'connection',
            dbType: 'yarn',
            children: [
                {
                    id: 'y1:yarn:feature:applications',
                    label: 'applications',
                    type: 'yarn-feature',
                    dbType: 'yarn',
                    meta: 'applications',
                },
            ],
        }
        assert.equal(ensureCatalogFeatureChildren(yarn), true)
        assert.equal(yarn.children?.length, 1)
        assert.equal(yarn.children?.[0].meta, 'workbench')

        const nacos: TreeNode = {
            id: 'n1',
            label: 'Nacos',
            type: 'connection',
            dbType: 'nacos',
            children: [],
        }
        assert.equal(ensureCatalogFeatureChildren(nacos), false)

        const trino: TreeNode = {
            id: 't1',
            label: 'Trino',
            type: 'connection',
            dbType: 'trino',
            children: [],
        }
        assert.equal(ensureCatalogFeatureChildren(trino), false)
        assert.equal(trino.children?.length ?? 0, 0)
    })

    it('keeps fallback when API catalog omits nacos', () => {
        __setExplorerUiCatalogForTests({
            profiles: [
                {
                    dbType: 'polaris',
                    features: [
                        {
                            id: 'services',
                            nodeType: 'polaris-feature',
                            openKind: 'polaris-services',
                            menuId: 'open-polaris-services',
                            icon: 'link',
                            labelKey: 'explorer.polarisFeatures.services',
                            order: 10,
                        },
                    ],
                },
            ],
        })
        assert.ok(getExplorerUiProfile('nacos'))
        assert.equal(getExplorerUiProfile('polaris')?.features.length, 1)
    })
})
