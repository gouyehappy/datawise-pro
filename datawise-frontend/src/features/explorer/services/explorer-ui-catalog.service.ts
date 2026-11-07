import type {ComposerTranslation} from 'vue-i18n'
import type {ContextMenuIcon, ContextMenuItem, DbType, TreeNode, TreeNodeType} from '@/core/types'
import type {DwIconName} from '@/core/icons'
import type {
    ConnectorExplorerFeature,
    ConnectorExplorerUiCatalog,
    ConnectorExplorerUiProfile,
} from '@/features/explorer/services/explorer-ui-catalog.types'
import {
    includeExplorerFeatureInMenu,
    includeExplorerFeatureInTree,
} from '@/features/explorer/services/explorer-ui-catalog.types'

function k8sFallbackFeature(
    id: string,
    menuId: string,
    icon: string,
    labelKey: string,
    order: number,
): ConnectorExplorerFeature {
    return {
        id,
        nodeType: 'k8s-feature',
        openKind: `k8s-${id}`,
        menuId,
        icon,
        labelKey,
        order,
        showInTree: false,
        treeNodeIdSuffix: `:k8s:feature:${id}`,
    }
}

/** Static fallback when API is unavailable (keeps platform trees usable offline). */
export const FALLBACK_EXPLORER_UI_PROFILES: ConnectorExplorerUiProfile[] = [
    {
        dbType: 'nacos',
        features: [
            {
                id: 'configs',
                nodeType: 'nacos-feature',
                openKind: 'nacos-configs',
                menuId: 'open-nacos-configs',
                icon: 'settings',
                labelKey: 'explorer.nacosFeatures.configs',
                order: 10,
                showInTree: false,
            },
            {
                id: 'services',
                nodeType: 'nacos-feature',
                openKind: 'nacos-services',
                menuId: 'open-nacos-services',
                icon: 'link',
                labelKey: 'explorer.nacosFeatures.services',
                order: 20,
                showInTree: false,
            },
        ],
    },
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
                showInTree: false,
            },
            {
                id: 'configs',
                nodeType: 'polaris-feature',
                openKind: 'polaris-configs',
                menuId: 'open-polaris-configs',
                icon: 'settings',
                labelKey: 'explorer.polarisFeatures.configs',
                order: 20,
                showInTree: false,
            },
        ],
    },
    {
        dbType: 'redis',
        features: [
            {
                id: 'workbench',
                nodeType: 'redis-feature',
                openKind: 'redis-workbench',
                menuId: 'open-redis-workbench',
                icon: 'console',
                labelKey: 'explorer.redisFeatures.workbench',
                order: 10,
                showInTree: true,
                showInMenu: true,
            },
        ],
    },
    {
        dbType: 'elasticsearch',
        features: [
            {
                id: 'workbench',
                nodeType: 'elasticsearch-feature',
                openKind: 'elasticsearch-workbench',
                menuId: 'open-elasticsearch-workbench',
                icon: 'console',
                labelKey: 'explorer.elasticsearchFeatures.workbench',
                order: 10,
                showInTree: true,
                showInMenu: true,
            },
        ],
    },
    {
        dbType: 'kafka',
        features: [
            {
                id: 'workbench',
                nodeType: 'kafka-feature',
                openKind: 'kafka-topics',
                menuId: 'open-kafka-workbench',
                icon: 'tab-kafka',
                labelKey: 'explorer.kafkaFeatures.workbench',
                order: 5,
                showInTree: true,
                showInMenu: false,
            },
            {
                id: 'topics',
                nodeType: 'kafka-feature',
                openKind: 'kafka-topics',
                menuId: 'open-kafka-topics',
                icon: 'tab-kafka',
                labelKey: 'explorer.kafkaFeatures.topics',
                order: 10,
                showInTree: false,
            },
            {
                id: 'consumer-groups',
                nodeType: 'kafka-feature',
                openKind: 'kafka-consumer-groups',
                menuId: 'open-kafka-consumer-groups',
                icon: 'users',
                labelKey: 'explorer.kafkaFeatures.consumerGroups',
                order: 20,
                showInTree: false,
            },
            {
                id: 'table-publish',
                nodeType: 'kafka-feature',
                openKind: 'kafka-table-publish',
                menuId: 'publish-table-data',
                icon: 'export',
                labelKey: 'explorer.kafkaFeatures.tablePublish',
                order: 30,
            },
        ],
    },
    {
        dbType: 'yarn',
        features: [
            {
                id: 'workbench',
                nodeType: 'yarn-feature',
                openKind: 'yarn-applications',
                menuId: 'open-yarn-workbench',
                icon: 'tab-yarn',
                labelKey: 'explorer.yarnFeatures.workbench',
                order: 5,
                showInTree: true,
                showInMenu: false,
            },
            {
                id: 'applications',
                nodeType: 'yarn-feature',
                openKind: 'yarn-applications',
                menuId: 'open-yarn-applications',
                icon: 'tab-yarn',
                labelKey: 'explorer.yarnFeatures.applications',
                order: 10,
                showInTree: false,
            },
            {
                id: 'nodes',
                nodeType: 'yarn-feature',
                openKind: 'yarn-nodes',
                menuId: 'open-yarn-nodes',
                icon: 'cpu',
                labelKey: 'explorer.yarnFeatures.nodes',
                order: 20,
                showInTree: false,
            },
            {
                id: 'queues',
                nodeType: 'yarn-feature',
                openKind: 'yarn-queues',
                menuId: 'open-yarn-queues',
                icon: 'menu-group',
                labelKey: 'explorer.yarnFeatures.queues',
                order: 30,
                showInTree: false,
            },
        ],
    },
    {
        dbType: 'jenkins',
        features: [
            {
                id: 'workbench',
                nodeType: 'jenkins-feature',
                openKind: 'jenkins-jobs',
                menuId: 'open-jenkins-workbench',
                icon: 'tab-jenkins',
                labelKey: 'explorer.jenkinsFeatures.workbench',
                order: 5,
                showInTree: true,
                showInMenu: false,
            },
            {
                id: 'jobs',
                nodeType: 'jenkins-feature',
                openKind: 'jenkins-jobs',
                menuId: 'open-jenkins-jobs',
                icon: 'tab-jenkins',
                labelKey: 'explorer.jenkinsFeatures.jobs',
                order: 10,
                showInTree: false,
            },
            {
                id: 'nodes',
                nodeType: 'jenkins-feature',
                openKind: 'jenkins-nodes',
                menuId: 'open-jenkins-nodes',
                icon: 'cpu',
                labelKey: 'explorer.jenkinsFeatures.nodes',
                order: 20,
                showInTree: false,
            },
        ],
    },
    {
        dbType: 'kubernetes',
        features: [
            k8sFallbackFeature('pods', 'open-k8s-pods', 'cpu', 'explorer.k8sFeatures.pods', 10),
            k8sFallbackFeature('deployments', 'open-k8s-deployments', 'menu-group', 'explorer.k8sFeatures.deployments', 20),
            k8sFallbackFeature('services', 'open-k8s-services', 'cpu', 'explorer.k8sFeatures.services', 30),
            k8sFallbackFeature('events', 'open-k8s-events', 'cpu', 'explorer.k8sFeatures.events', 40),
            k8sFallbackFeature('configmaps', 'open-k8s-configmaps', 'cpu', 'explorer.k8sFeatures.configmaps', 50),
            k8sFallbackFeature('secrets', 'open-k8s-secrets', 'cpu', 'explorer.k8sFeatures.secrets', 60),
            k8sFallbackFeature('apply', 'open-k8s-apply', 'cpu', 'explorer.k8sFeatures.apply', 70),
            k8sFallbackFeature('crds', 'open-k8s-crds', 'cpu', 'explorer.k8sFeatures.crds', 80),
            k8sFallbackFeature('helm', 'open-k8s-helm', 'cpu', 'explorer.k8sFeatures.helm', 90),
        ],
    },
    {
        dbType: 'ssh',
        features: [
            {
                id: 'terminal',
                nodeType: 'ssh-terminal',
                openKind: 'ssh-terminal',
                menuId: 'open-ssh-terminal',
                icon: 'console',
                labelKey: 'explorer.sshFeatures.terminal',
                order: 10,
                treeNodeIdSuffix: ':ssh-terminal',
            },
            {
                id: 'new-terminal',
                nodeType: 'ssh-terminal',
                openKind: 'ssh-terminal-new',
                menuId: 'new-ssh-terminal',
                icon: 'console',
                labelKey: 'explorer.context.newSshTerminal',
                order: 15,
                showInTree: false,
                showInMenu: true,
            },
            {
                id: 'script-records',
                nodeType: 'ssh-script-records',
                openKind: 'ssh-script-records',
                menuId: 'open-ssh-script-records',
                icon: 'folder',
                labelKey: 'explorer.sshFeatures.scriptRecords',
                order: 20,
                showInTree: true,
                showInMenu: false,
                treeNodeIdSuffix: ':ssh:script-records',
            },
        ],
    },
]

let catalogByDbType = new Map<string, ConnectorExplorerUiProfile>()
/** Tree feature nodeTypes declared by any profile (e.g. redis-feature, ssh-terminal). */
let featureNodeTypes = new Set<string>()
/** nodeType → dbType for icon/label resolution when dbType is omitted. */
let featureNodeTypeToDbType = new Map<string, string>()
let loadPromise: Promise<void> | null = null
let loadedFromApi = false

function normalizeDbType(dbType: string | undefined | null): string {
    return (dbType ?? '').trim().toLowerCase()
}

function sortFeatures(features: ConnectorExplorerFeature[]): ConnectorExplorerFeature[] {
    return [...features].sort((a, b) => a.order - b.order)
}

function rebuildFeatureNodeTypeIndex(profiles: Iterable<ConnectorExplorerUiProfile>): void {
    const types = new Set<string>()
    const typeToDb = new Map<string, string>()
    for (const profile of profiles) {
        for (const feature of profile.features) {
            if (!includeExplorerFeatureInTree(feature)) continue
            const nodeType = feature.nodeType?.trim()
            if (!nodeType) continue
            types.add(nodeType)
            if (!typeToDb.has(nodeType)) {
                typeToDb.set(nodeType, profile.dbType)
            }
        }
    }
    featureNodeTypes = types
    featureNodeTypeToDbType = typeToDb
}

function indexCatalog(catalog: ConnectorExplorerUiCatalog | null | undefined): void {
    const next = new Map<string, ConnectorExplorerUiProfile>()
    for (const profile of catalog?.profiles ?? []) {
        const dbType = normalizeDbType(profile.dbType)
        if (!dbType) continue
        next.set(dbType, coerceRedisWorkbenchProfile(coerceElasticsearchWorkbenchProfile(coerceWorkbenchMenuOnlyProfile({
            dbType,
            features: sortFeatures(profile.features ?? []),
        }))))
    }
    // Keep fallback profiles when API omitted them.
    for (const fallback of FALLBACK_EXPLORER_UI_PROFILES) {
        if (!next.has(fallback.dbType)) {
            next.set(fallback.dbType, {
                dbType: fallback.dbType,
                features: sortFeatures(fallback.features),
            })
        }
    }
    catalogByDbType = next
    rebuildFeatureNodeTypeIndex(next.values())
}

/** Redis: one「工作台」in the tree and connection menu (keys / command are tabs). */
function coerceRedisWorkbenchProfile(profile: ConnectorExplorerUiProfile): ConnectorExplorerUiProfile {
    if (profile.dbType !== 'redis') return profile
    const workbench = FALLBACK_EXPLORER_UI_PROFILES
        .find((item) => item.dbType === 'redis')
        ?.features.find((item) => item.id === 'workbench')
    if (!workbench) return profile
    return {
        ...profile,
        features: sortFeatures([workbench]),
    }
}

/** Elasticsearch: one「工作台」in the tree and connection menu (documents / REST are tabs). */
function coerceElasticsearchWorkbenchProfile(profile: ConnectorExplorerUiProfile): ConnectorExplorerUiProfile {
    if (profile.dbType !== 'elasticsearch') return profile
    const workbench = FALLBACK_EXPLORER_UI_PROFILES
        .find((item) => item.dbType === 'elasticsearch')
        ?.features.find((item) => item.id === 'workbench')
    if (!workbench) return profile
    return {
        ...profile,
        features: sortFeatures([workbench]),
    }
}

/** YARN / Jenkins / Kafka: one tree entry「工作台」; Kafka also keeps 表数据发布. */
function coerceWorkbenchMenuOnlyProfile(profile: ConnectorExplorerUiProfile): ConnectorExplorerUiProfile {
    if (profile.dbType === 'kafka') return coerceKafkaTreeProfile(profile)
    if (profile.dbType !== 'yarn' && profile.dbType !== 'jenkins') return profile
    const fallback = FALLBACK_EXPLORER_UI_PROFILES.find((item) => item.dbType === profile.dbType)
    const workbench = fallback?.features.find((item) => item.id === 'workbench')
    let features = [...profile.features]
    if (workbench && !features.some((item) => item.id === 'workbench')) {
        features = [workbench, ...features]
    }
    return {
        ...profile,
        features: sortFeatures(
            features.map((feature) => {
                if (feature.id === 'workbench') {
                    return {...feature, showInTree: true, showInMenu: false}
                }
                return {
                    ...feature,
                    showInTree: false,
                    showInMenu: feature.showInMenu !== false,
                }
            }),
        ),
    }
}

const KAFKA_TREE_FEATURE_IDS = new Set(['workbench', 'table-publish'])

function coerceKafkaTreeProfile(profile: ConnectorExplorerUiProfile): ConnectorExplorerUiProfile {
    const fallback = FALLBACK_EXPLORER_UI_PROFILES.find((item) => item.dbType === 'kafka')
    const workbench = fallback?.features.find((item) => item.id === 'workbench')
    let features = [...profile.features]
    if (workbench && !features.some((item) => item.id === 'workbench')) {
        features = [workbench, ...features]
    }
    return {
        ...profile,
        features: sortFeatures(
            features.map((feature) => {
                if (KAFKA_TREE_FEATURE_IDS.has(feature.id)) {
                    return {
                        ...feature,
                        showInTree: true,
                        showInMenu: feature.id === 'workbench' ? false : feature.showInMenu !== false,
                    }
                }
                return {
                    ...feature,
                    showInTree: false,
                    showInMenu: feature.showInMenu !== false,
                }
            }),
        ),
    }
}

/** Seed fallback immediately so sync tree builders work before first fetch. */
indexCatalog({profiles: FALLBACK_EXPLORER_UI_PROFILES})

export function getExplorerUiProfile(dbType: string | undefined | null): ConnectorExplorerUiProfile | null {
    const key = normalizeDbType(dbType)
    if (!key) return null
    return catalogByDbType.get(key) ?? null
}

/** True when dbType has at least one tree-visible explorer feature (platform flat catalog). */
export function hasExplorerUiTreeFeatures(dbType: string | undefined | null): boolean {
    const profile = getExplorerUiProfile(dbType)
    return Boolean(profile?.features.some(includeExplorerFeatureInTree))
}

/** True when node type is a catalog-declared connection feature child. */
export function isExplorerUiFeatureNodeType(type: string | undefined | null): boolean {
    if (!type) return false
    return featureNodeTypes.has(type)
}

export function resolveDbTypeForExplorerFeatureNodeType(nodeType: string | undefined | null): string | null {
    if (!nodeType) return null
    return featureNodeTypeToDbType.get(nodeType) ?? null
}

export function findExplorerUiFeature(
    dbType: string | undefined | null,
    featureId: string | undefined | null,
): ConnectorExplorerFeature | null {
    const profile = getExplorerUiProfile(dbType)
    if (!profile || !featureId) return null
    return profile.features.find((item) => item.id === featureId) ?? null
}

export function resolveExplorerUiFeatureLabel(
    dbType: string | undefined | null,
    featureId: string | undefined | null,
    t: ComposerTranslation,
    nodeType?: string | null,
): string | null {
    let feature = findExplorerUiFeature(dbType, featureId)
    if (!feature && nodeType) {
        const profile = getExplorerUiProfile(dbType)
        feature = profile?.features.find(
            (item) => item.nodeType === nodeType && includeExplorerFeatureInTree(item),
        ) ?? null
    }
    if (!feature?.labelKey) return null
    return t(feature.labelKey)
}

export function resolveExplorerUiFeatureIcon(
    dbType: string | undefined | null,
    featureId: string | undefined | null,
): DwIconName | null {
    const feature = findExplorerUiFeature(dbType, featureId)
    if (!feature?.icon) return null
    return feature.icon as DwIconName
}

export function resolveExplorerFeatureTreeNodeId(
    connectionId: string,
    profile: ConnectorExplorerUiProfile,
    feature: ConnectorExplorerFeature,
): string {
    const suffix = feature.treeNodeIdSuffix?.trim()
    if (suffix) {
        return suffix.startsWith(':') ? `${connectionId}${suffix}` : `${connectionId}:${suffix}`
    }
    return `${connectionId}:${profile.dbType}:feature:${feature.id}`
}

function resolveConnectionMenuIcon(icon: string | undefined | null): ContextMenuIcon {
    if (
        icon === 'console'
        || icon === 'export'
        || icon === 'open'
        || icon === 'file'
        || icon === 'edit'
        || icon === 'refresh'
        || icon === 'copy'
        || icon === 'delete'
    ) {
        return icon
    }
    if (icon === 'folder') return 'file'
    return 'open'
}

export function buildConnectionFeatureChildrenFromProfile(
    connectionId: string,
    profile: ConnectorExplorerUiProfile,
): TreeNode[] {
    const dbType = profile.dbType as DbType
    return sortFeatures(profile.features)
        .filter(includeExplorerFeatureInTree)
        .map((feature) => ({
            id: resolveExplorerFeatureTreeNodeId(connectionId, profile, feature),
            label: feature.id,
            type: feature.nodeType as TreeNodeType,
            dbType,
            meta: feature.id,
        }))
}

export function buildConnectionMenuOpenItemsFromProfile(
    profile: ConnectorExplorerUiProfile,
    t: ComposerTranslation,
): ContextMenuItem[] {
    return sortFeatures(profile.features)
        .filter(includeExplorerFeatureInMenu)
        .map((feature) => ({
            id: feature.menuId,
            label: t(feature.labelKey),
            icon: resolveConnectionMenuIcon(feature.icon),
        }))
}

/**
 * Sync catalog-declared feature children under a connection node.
 * Prunes menu-only / retired feature rows (e.g. YARN apps/nodes/queues after workbench tabs).
 * No-op when the dbType has no explorer UI profile (e.g. JDBC / Trino / SQL Server).
 */
export function ensureCatalogFeatureChildren(node: TreeNode): boolean {
    if (node.type !== 'connection' || !node.dbType) return false
    const profile = getExplorerUiProfile(node.dbType)
    if (!profile) return false

    const expected = buildConnectionFeatureChildrenFromProfile(node.id, profile)
    const featureNodeTypes = new Set(
        profile.features.map((item) => item.nodeType).filter(Boolean),
    )
    if (!featureNodeTypes.size) return false

    const others = (node.children ?? []).filter((child) => !featureNodeTypes.has(child.type))
    const nextChildren = [...others, ...expected]
    const prev = node.children ?? []
    const unchanged =
        prev.length === nextChildren.length
        && prev.every((child, index) => {
            const next = nextChildren[index]
            return child.id === next.id && child.type === next.type && child.meta === next.meta
        })
    if (unchanged) return expected.length > 0

    node.children = nextChildren
    return expected.length > 0 || others.length !== prev.length
}

export async function ensureExplorerUiCatalogLoaded(options?: {force?: boolean}): Promise<void> {
    if (loadedFromApi && !options?.force) return
    if (loadPromise && !options?.force) return loadPromise
    loadPromise = (async () => {
        try {
            const {datasourcesApi} = await import('@/api')
            const catalog = await datasourcesApi.fetchExplorerUiCatalog()
            indexCatalog(catalog)
            loadedFromApi = true
        } catch {
            indexCatalog({profiles: FALLBACK_EXPLORER_UI_PROFILES})
        } finally {
            loadPromise = null
        }
    })()
    return loadPromise
}

/** Test helper: replace in-memory catalog. */
export function __setExplorerUiCatalogForTests(catalog: ConnectorExplorerUiCatalog | null): void {
    loadedFromApi = false
    if (catalog == null) {
        indexCatalog({profiles: FALLBACK_EXPLORER_UI_PROFILES})
        return
    }
    indexCatalog(catalog)
    loadedFromApi = true
}
