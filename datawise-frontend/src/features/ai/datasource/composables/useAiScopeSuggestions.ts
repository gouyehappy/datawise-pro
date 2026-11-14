import {ref, watch} from 'vue'
import {storeToRefs} from 'pinia'
import type {DbType, TreeNode} from '@/core/types'
import {walkTree} from '@/core/utils/tree'
import {fetchAiSchemaTables} from '@/features/ai/datasource/services/ai-schema.service'
import {buildAiTableTargetId} from '@/features/ai/shared/utils/database-targets'
import {updateAiTableTags} from '@/features/ai/tag/services/ai-table-tag.service'
import {notifyAiTableTagsChanged} from '@/features/ai/tag/services/ai-table-tag.events'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {readRecentConnectionIds} from '@/features/workspace/services/welcome-recent-connections.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {t} from '@/i18n'

/** 空态最多直接推荐多少张表；再多就要求用户自己挑 */
export const AI_SCOPE_SUGGESTION_LIMIT = 3

/** 系统库/内部表不进推荐，避免第一次提问就撞上元数据表 */
const INTERNAL_SCHEMAS = new Set([
    'information_schema',
    'performance_schema',
    'mysql',
    'sys',
    'pg_catalog',
    'pg_toast',
    'sqlite_master',
])

export interface AiScopeSuggestionScope {
    connectionId: string
    connectionLabel: string
    dbType: DbType
    /** 打标 API 的 database 维度，必填 */
    database: string
    databaseLabel: string
}

function isInternalTable(tableName: string): boolean {
    const dot = tableName.indexOf('.')
    if (dot > 0 && INTERNAL_SCHEMAS.has(tableName.slice(0, dot).toLowerCase())) return true
    const lower = tableName.toLowerCase()
    return lower.startsWith('__') || lower.startsWith('_tmp')
}

/**
 * 从已过滤的内部表里挑出候选推荐。
 * 目前没有使用热度信号，按名称稳定排序取前 N，保证同一连接下推荐结果可预测。
 */
export function pickSuggestedTables(
    tables: readonly string[],
    limit = AI_SCOPE_SUGGESTION_LIMIT,
): string[] {
    return tables
        .filter((name) => name.trim() && !isInternalTable(name))
        .sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'}))
        .slice(0, limit)
}

interface ConnectionCandidate {
    connectionId: string
    connectionLabel: string
    dbType: DbType
    databases: string[]
    defaultDatabase: string
}

function listConnectionCandidates(tree: TreeNode[]): ConnectionCandidate[] {
    const candidates: ConnectionCandidate[] = []
    walkTree(tree, (node) => {
        if (node.type !== 'connection') return
        candidates.push({
            connectionId: node.id,
            connectionLabel: node.label,
            dbType: node.dbType ?? 'mysql',
            databases: (node.children ?? [])
                .filter((child) => child.type === 'database')
                .map((child) => child.label)
                .filter(Boolean),
            defaultDatabase: node.database?.trim() ?? '',
        })
    })
    return candidates
}

/**
 * 选出「默认推荐哪个连接、哪个库」：先已连接，再最近使用，最后按树内顺序。
 * 没有可用库时返回 null —— 打标必须有库名，宁可不推荐也不给假入口。
 */
export function resolveSuggestionScope(
    tree: TreeNode[],
    preferredConnectionIds: readonly string[] = [],
): AiScopeSuggestionScope | null {
    const candidates = listConnectionCandidates(tree)
    if (!candidates.length) return null

    const rank = new Map<string, number>()
    preferredConnectionIds.forEach((id, index) => {
        if (!rank.has(id)) rank.set(id, index)
    })

    const ordered = [...candidates].sort((a, b) => {
        const rankA = rank.get(a.connectionId) ?? Number.MAX_SAFE_INTEGER
        const rankB = rank.get(b.connectionId) ?? Number.MAX_SAFE_INTEGER
        return rankA - rankB
    })

    for (const candidate of ordered) {
        const database = candidate.databases[0] ?? candidate.defaultDatabase
        if (!database) continue
        return {
            connectionId: candidate.connectionId,
            connectionLabel: candidate.connectionLabel,
            dbType: candidate.dbType,
            database,
            databaseLabel: database,
        }
    }
    return null
}

/**
 * AI 数据范围空态推荐：按连接给出的可读表候选，一键纳入即完成打标。
 * 把打标从「治理动作」降级为「顺手动作」，同时保留手工挑表的退路。
 */
export function useAiScopeSuggestions() {
    const explorer = useExplorerStore()
    const {tree, pooledConnectionIds} = storeToRefs(explorer)

    const scope = ref<AiScopeSuggestionScope | null>(null)
    const tables = ref<string[]>([])
    const loading = ref(false)
    const applying = ref(false)
    const error = ref<string | null>(null)

    let loadedKey = ''

    function resolvePreferredConnectionIds(): string[] {
        return [...pooledConnectionIds.value, ...readRecentConnectionIds()]
    }

    function scopeKeyOf(next: AiScopeSuggestionScope | null): string {
        return next ? `${next.connectionId}|${next.database}` : ''
    }

    async function loadTables(target: AiScopeSuggestionScope) {
        loading.value = true
        error.value = null
        try {
            tables.value = await fetchAiSchemaTables(
                target.connectionId,
                target.database,
                {silent: true},
            )
        } catch (err) {
            tables.value = []
            error.value = resolveCaughtApiErrorMessage(
                err,
                t,
                'ai.databasePanel.recommend.failed',
            )
        } finally {
            loading.value = false
        }
    }

    /** 惰性加载：仅在空态真正显示时才请求，多次触发只拉一次 */
    async function ensureLoaded() {
        const next = resolveSuggestionScope(tree.value, resolvePreferredConnectionIds())
        scope.value = next
        const key = scopeKeyOf(next)
        if (!next || key === loadedKey) return
        loadedKey = key
        await loadTables(next)
    }

    async function reload() {
        loadedKey = ''
        await ensureLoaded()
    }

    /** 纳入选中的表：打标 → 广播 → 返回可直接用于会话范围的 target id */
    async function apply(tableNames: readonly string[]): Promise<string[]> {
        const target = scope.value
        if (!target || !tableNames.length) return []
        applying.value = true
        try {
            await updateAiTableTags(
                target.connectionId,
                target.database,
                [...tableNames],
                true,
            )
            notifyAiTableTagsChanged()
            return tableNames.map((tableName) =>
                buildAiTableTargetId(target.connectionId, target.database, tableName),
            )
        } finally {
            applying.value = false
        }
    }

    // 连接新增/删除后推荐范围可能失效，重新解析（表清单按需再拉）
    watch(
        () => tree.value,
        () => {
            const next = resolveSuggestionScope(tree.value, resolvePreferredConnectionIds())
            if (scopeKeyOf(next) === scopeKeyOf(scope.value)) return
            loadedKey = ''
            scope.value = next
            tables.value = []
            if (next) void loadTables(next)
        },
    )

    return {
        scope,
        tables,
        loading,
        applying,
        error,
        ensureLoaded,
        reload,
        apply,
    }
}
