import {nextScriptFileName} from '@/features/explorer/services/sql-script-naming'

export type ConsoleTabKind = 'script' | 'console'

/** 从连接名中提取 IP（如 DEV_192.0.2.141 → 192.0.2.141） */
export function extractHostFromConnectionName(connectionName?: string | null): string | undefined {
    const name = connectionName?.trim()
    if (!name) return undefined
    const match = name.match(/(\d{1,3}(?:\.\d{1,3}){3})/)
    return match?.[1] ?? name
}

export function resolveConnectionHostLabel(options: {
    connectionHost?: string | null
    connectionName?: string | null
}): string | undefined {
    const host = options.connectionHost?.trim()
    if (host) return host
    return extractHostFromConnectionName(options.connectionName)
}

/** workspaces 文件名 → Tab 展示名（Script-N.sql 保持 Script-N） */
export function formatSqlFileTabLabel(fileName: string): string {
    const base = fileName.replace(/\.sql$/i, '').trim()
    if (!base) return ''
    const scriptMatch = base.match(/^Script-(\d+)$/i)
    if (scriptMatch) return `Script-${scriptMatch[1]}`
    return base
}

/** Tab / 重命名输入是否可作为 workspaces 文件名（不含 .sql） */
export function isValidSqlFileBaseName(base: string): boolean {
    const trimmed = base.trim().replace(/\.sql$/i, '')
    if (!trimmed) return false
    if (/^[-_.]+$/.test(trimmed)) return false
    return /[\w\u4e00-\u9fff]/.test(trimmed)
}

/** 控制台 Tab 标题：<host> Script-N / <host> 自定义名 */
export function resolveConsoleTabTitle(options: {
    connectionHost?: string | null
    connectionName?: string | null
    sqlFile?: string | null
    kind?: ConsoleTabKind
}): string | undefined {
    const hostLabel = resolveConnectionHostLabel(options)
    const prefix = hostLabel ? `<${hostLabel}>` : undefined

    const file = options.sqlFile?.trim()
    if (file) {
        const label = formatSqlFileTabLabel(file).trim()
        if (!label) {
            return prefix ? `${prefix} ${file.replace(/\.sql$/i, '')}` : file.replace(/\.sql$/i, '')
        }
        return prefix ? `${prefix} ${label}` : label
    }

    if (options.kind === 'console') {
        return prefix ? `${prefix} Script-1` : 'Script-1'
    }

    return prefix ?? options.connectionName?.trim() ?? undefined
}

/** 解析 Tab 标题中的固定 host 前缀与可编辑后缀 */
export function parseConsoleTabTitle(title: string): {
    hostLabel?: string
    editableLabel: string
    hasHostPrefix: boolean
} {
    const trimmed = title.trim()
    const match = trimmed.match(/^<([^>]+)>\s*(.+)$/)
    if (match) {
        return {
            hostLabel: match[1],
            editableLabel: match[2].trim(),
            hasHostPrefix: true,
        }
    }
    return {
        editableLabel: trimmed,
        hasHostPrefix: false,
    }
}

export function buildConsoleTabTitleFromParts(
    hostLabel: string | undefined,
    editableLabel: string,
): string {
    const label = editableLabel.trim()
    if (!label) return hostLabel ? `<${hostLabel}> Script-1` : 'Script-1'
    return hostLabel ? `<${hostLabel}> ${label}` : label
}

const SCRIPT_TAB_LABEL_PATTERN = /^script[- ](\d+)$/i

/** 从 Tab 标题解析 Script-N.sql（兼容旧版 Script N） */
export function scriptFileNameFromTabTitle(title: string): string | null {
    const parsed = parseConsoleTabTitle(title)
    const scriptMatch = parsed.editableLabel.trim().match(SCRIPT_TAB_LABEL_PATTERN)
    if (scriptMatch) return `Script-${scriptMatch[1]}.sql`

    const base = sqlFileNameFromTabLabel(parsed.editableLabel)
    if (!base || /^console$/i.test(base)) return null
    return `${base}.sql`
}

/** 从 Tab 状态推断 workspaces 脚本文件名 */
export function extractScriptFileNameFromTab(tab: {
    type?: string
    sqlFile?: string | null
    title?: string
}): string | null {
    const bound = tab.sqlFile?.trim()
    if (bound) return bound
    if (tab.type !== 'console' || !tab.title) return null
    return scriptFileNameFromTabTitle(tab.title)
}

/** 合并 workspaces 已有文件与 Tab 预占用的 Script 文件名（去重） */
export function mergeConsoleScriptFileNames(
    diskFileNames: string[],
    tabFileNames: string[],
): { fileName: string }[] {
    const byKey = new Map<string, string>()
    for (const name of [...diskFileNames, ...tabFileNames]) {
        const trimmed = name.trim()
        if (!trimmed) continue
        byKey.set(trimmed.toLowerCase(), trimmed)
    }
    return [...byKey.values()].map((fileName) => ({fileName}))
}

/** 为新建空白控制台 Tab 分配下一个 Script-N.sql（合并磁盘 + 已打开 Tab） */
export function resolveNextConsoleScriptFileName(options: {
    tabs: {
        id?: string
        type?: string
        connectionId?: string
        instanceId?: string | null
        sqlFile?: string | null
        title?: string
    }[]
    connectionId: string
    instanceId?: string | null
    diskFileNames?: string[]
    excludeTabId?: string
}): string {
    const scoped = options.tabs.filter(
        (tab) =>
            tab.type === 'console' &&
            tab.connectionId === options.connectionId &&
            (options.instanceId == null || tab.instanceId === options.instanceId) &&
            tab.id !== options.excludeTabId,
    )
    const tabFileNames = scoped
        .map((tab) => extractScriptFileNameFromTab(tab))
        .filter((fileName): fileName is string => !!fileName)

    return nextScriptFileName(
        mergeConsoleScriptFileNames(options.diskFileNames ?? [], tabFileNames),
    )
}

/** Tab 展示名 → workspaces 文件名（不含 .sql）；仅用于已绑定文件的 Tab 重命名 */
export function sqlFileNameFromTabLabel(label: string): string {
    const trimmed = label.trim().replace(/\.sql$/i, '')
    if (!isValidSqlFileBaseName(trimmed)) return ''
    const scriptMatch = trimmed.match(SCRIPT_TAB_LABEL_PATTERN)
    if (scriptMatch) return `Script-${scriptMatch[1]}`
    return trimmed
}

/** 已绑定 workspaces 文件名；空白 Tab 未保存前为 null */
export function getBoundConsoleSqlFile(tab: { sqlFile?: string | null }): string | null {
    const bound = tab.sqlFile?.trim()
    return bound || null
}

/** 定位 / 重命名：优先 sqlFile，Script Tab 标题可反推 Script-N.sql */
export function resolveSqlFileForLocate(tab: {
    type?: string
    sqlFile?: string | null
    title: string
}): string | null {
    const bound = tab.sqlFile?.trim()
    if (bound) return bound
    if (tab.type !== 'console') return null

    const parsed = parseConsoleTabTitle(tab.title)
    const scriptMatch = parsed.editableLabel.trim().match(SCRIPT_TAB_LABEL_PATTERN)
    if (scriptMatch) return `Script-${scriptMatch[1]}.sql`

    const base = sqlFileNameFromTabLabel(parsed.editableLabel)
    if (!base || /^console$/i.test(base)) return null
    return `${base}.sql`
}

/** 重命名 / 定位时应使用的当前文件名 */
export function resolveConsoleSqlFileName(tab: {
    type?: string
    sqlFile?: string | null
    title: string
}): string | null {
    return getBoundConsoleSqlFile(tab) ?? resolveSqlFileForLocate(tab)
}

export function isSameConsoleTabLabel(fileName: string, editableLabel: string): boolean {
    const current = formatSqlFileTabLabel(fileName)
    const next = editableLabel.trim()
    return (
        current === next
        || fileName.replace(/\.sql$/i, '') === sqlFileNameFromTabLabel(next)
    )
}

/** 根据连接上下文刷新 Tab 标题（更新 host 前缀，保留脚本名/自定义后缀） */
export function syncConsoleTabTitle(
    tab: { type?: string; title: string; sqlFile?: string | null },
    connectionName?: string | null,
): string | undefined {
    if (tab.type !== 'console') return undefined

    const boundFile = getBoundConsoleSqlFile(tab)
    if (boundFile) {
        return resolveConsoleTabTitle({
            connectionName,
            sqlFile: boundFile,
            kind: 'script',
        })
    }

    const parsed = parseConsoleTabTitle(tab.title)
    const editable = parsed.editableLabel.trim()
    if (editable && !/^console$/i.test(editable)) {
        return buildConsoleTabTitleFromParts(
            resolveConnectionHostLabel({connectionName}),
            editable,
        )
    }

    return resolveConsoleTabTitle({connectionName, kind: 'console'})
}
