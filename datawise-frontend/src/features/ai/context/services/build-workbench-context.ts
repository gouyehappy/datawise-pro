import type {TreeNode, WorkspaceTab} from '@/core/types'
import {isDesktopApp} from '@/features/layout/services/desktop-chrome'
import {
    WORKBENCH_CONTEXT_BODY_MAX,
    WORKBENCH_CONTEXT_LOCAL_TEXT_BODY_MAX,
    WORKBENCH_CONTEXT_OPEN_TABS_MAX,
    type WorkbenchContextFocus,
    type WorkbenchContextSnapshot,
} from '@/features/ai/context/types/workbench-context.types'
import {truncateTextWithMeta, type TruncationMeta} from '@/shared/truncation/truncation-meta'

function objectKindFromNode(type: TreeNode['type'] | undefined): WorkbenchContextFocus['objectKind'] {
    switch (type) {
        case 'table':
            return 'table'
        case 'view':
            return 'view'
        case 'kafka-topic':
            return 'topic'
        case 'redis-key':
            return 'collection'
        default:
            return type ? 'other' : undefined
    }
}

function findInTree(
    tree: TreeNode[],
    nodeId: string | null,
): {connection: TreeNode | null; node: TreeNode | null; path: string[]} {
    if (!nodeId) return {connection: null, node: null, path: []}
    const path: string[] = []
    let found: TreeNode | null = null
    let connection: TreeNode | null = null

    function walk(nodes: TreeNode[], conn: TreeNode | null, trail: string[]): boolean {
        for (const n of nodes) {
            const nextTrail = [...trail, n.label]
            const nextConn = n.type === 'connection' ? n : conn
            if (n.id === nodeId) {
                found = n
                connection = nextConn
                path.push(...nextTrail)
                return true
            }
            if (n.children?.length && walk(n.children, nextConn, nextTrail)) {
                return true
            }
        }
        return false
    }

    walk(tree, null, [])
    return {connection, node: found, path}
}

function findConnectionById(tree: TreeNode[], connectionId: string | undefined): TreeNode | null {
    if (!connectionId) return null
    const hit = findInTree(tree, connectionId)
    if (hit.node?.type === 'connection') return hit.node
    return hit.connection
}

function truncateBody(
    sql: string | undefined,
    maxChars: number = WORKBENCH_CONTEXT_BODY_MAX,
): {
    bodyPreview?: string
    bodyTruncated?: boolean
    bodyLength?: number
    bodyTruncation?: TruncationMeta
} {
    if (sql == null) return {}
    const {text, truncation} = truncateTextWithMeta(sql, maxChars, {
        unit: 'chars',
        reason: 'preview',
    })
    return {
        bodyPreview: text,
        bodyTruncated: truncation.truncated,
        bodyLength: truncation.originalLength ?? sql.length,
        bodyTruncation: truncation,
    }
}

function fileBaseName(path: string | undefined): string | undefined {
    const raw = path?.trim()
    if (!raw) return undefined
    const parts = raw.replace(/\\/g, '/').split('/')
    return parts[parts.length - 1] || raw
}

/** Resolve object identity from active tab params (Redis / Kafka / K8s / local file). */
function objectFromActiveTab(tab: WorkspaceTab | null): {
    objectKind?: WorkbenchContextFocus['objectKind']
    objectName?: string
    resourcePath?: string
} {
    if (!tab) return {}
    const params = tab.params

    if (tab.type === 'local-text') {
        const path = tab.localFilePath?.trim()
        return {
            objectKind: 'file',
            objectName: fileBaseName(path) || tab.title,
            resourcePath: path || undefined,
        }
    }

    const redisKey = params?.redisKey?.trim()
    if (redisKey && (tab.type === 'redis-key' || tab.dbType === 'redis')) {
        return {objectKind: 'collection', objectName: redisKey}
    }

    const kafkaTopic = params?.kafkaTopic?.trim()
    if (kafkaTopic && (tab.type?.startsWith('kafka') || tab.dbType === 'kafka')) {
        return {objectKind: 'topic', objectName: kafkaTopic}
    }

    const k8sNs = params?.k8sNamespace?.trim()
    const k8sPod = params?.k8sPodName?.trim()
    if (tab.type?.startsWith('k8s') || tab.dbType === 'kubernetes') {
        if (k8sPod) return {objectKind: 'other', objectName: k8sNs ? `${k8sNs}/${k8sPod}` : k8sPod}
        if (k8sNs) return {objectKind: 'namespace', objectName: k8sNs}
    }

    if (tab.tableName) {
        // ES console stores index in tableName; SQL table/view use relationKind.
        if (tab.type === 'elasticsearch-console' || tab.dbType === 'elasticsearch') {
            return {objectKind: 'other', objectName: tab.tableName}
        }
        return {
            objectKind: tab.relationKind === 'view' ? 'view' : 'table',
            objectName: tab.tableName,
        }
    }

    return {}
}

export interface BuildWorkbenchContextInput {
    tabs: WorkspaceTab[]
    activeTab: WorkspaceTab | null
    explorerTree: TreeNode[]
    selectedNodeId: string | null
    layoutModule?: string | null
}

export function buildWorkbenchContextSnapshot(
    input: BuildWorkbenchContextInput,
): WorkbenchContextSnapshot {
    const {tabs, activeTab, explorerTree, selectedNodeId, layoutModule} = input
    const selected = findInTree(explorerTree, selectedNodeId)
    const tabConnection = findConnectionById(explorerTree, activeTab?.connectionId)

    let surface: WorkbenchContextFocus['surface'] = 'workspace'
    if (layoutModule === 'ai') surface = 'ai'
    else if (layoutModule === 'settings') surface = 'settings'
    else if (activeTab?.type === 'community-workbench') surface = 'plugin'
    else if (!activeTab && selected.node) surface = 'explorer'

    const focusConnection = tabConnection ?? selected.connection
    const fromTab = objectFromActiveTab(activeTab)
    const fromExplorerKind = objectKindFromNode(selected.node?.type)
    const fromExplorerName =
        selected.node && ['table', 'view', 'kafka-topic', 'redis-key'].includes(selected.node.type)
            ? selected.node.label
            : undefined

    const focus: WorkbenchContextFocus = {
        surface,
        connectionId: focusConnection?.id ?? activeTab?.connectionId ?? selected.connection?.id,
        connectionName: focusConnection?.label,
        database: activeTab?.database ?? selected.node?.database ?? focusConnection?.database,
        dialect: activeTab?.dbType ?? focusConnection?.dbType ?? selected.node?.dbType,
        environment: focusConnection?.env,
        objectKind: fromTab.objectKind ?? fromExplorerKind,
        objectName: fromTab.objectName ?? fromExplorerName,
        pluginId: activeTab?.pluginId ?? focusConnection?.pluginId,
        workbenchId: activeTab?.type === 'community-workbench' ? activeTab.id : undefined,
        resourcePath: fromTab.resourcePath,
    }

    const bodyMax =
        activeTab?.type === 'local-text'
            ? WORKBENCH_CONTEXT_LOCAL_TEXT_BODY_MAX
            : WORKBENCH_CONTEXT_BODY_MAX
    const body = truncateBody(
        activeTab && (activeTab.type === 'console' || activeTab.type === 'local-text')
            ? activeTab.sql
            : undefined,
        bodyMax,
    )

    return {
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        publisher: isDesktopApp() ? 'desktop' : 'web',
        online: true,
        focus,
        activeTab: activeTab
            ? {
                id: activeTab.id,
                type: activeTab.type,
                title: activeTab.title,
                connectionId: activeTab.connectionId,
                database: activeTab.database,
                localFilePath: activeTab.localFilePath,
                ...body,
            }
            : null,
        openTabs: tabs.slice(0, WORKBENCH_CONTEXT_OPEN_TABS_MAX).map((tab) => ({
            id: tab.id,
            type: tab.type,
            title: tab.title,
            connectionId: tab.connectionId,
            database: tab.database,
        })),
        selection: selected.path.length > 0 ? {explorerPath: selected.path} : null,
        pluginFocus: [],
        privacy: {
            secretsRedacted: true,
            bodyPreviewMaxChars: WORKBENCH_CONTEXT_BODY_MAX,
            pluginTailMaxChars: 4 * 1024,
        },
    }
}
