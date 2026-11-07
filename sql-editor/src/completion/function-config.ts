import {resolveSqlDialectFile} from '@sql-editor/completion/dialect-aliases'
import {getActiveSqlDialectFile} from './keyword-config'

export type SqlFunctionSignature = {
    /** 函数名（不含括号） */
    name: string
    /** 参数签名（用于列表展示） */
    signature?: string
    /** 返回类型（用于列表展示） */
    returns?: string
    /** Monaco snippet 插入模板（可选；默认由 signature 推导） */
    insertText?: string
}

export interface SqlFunctionFileConfig {
    functions: SqlFunctionSignature[]
}

import {functionFiles} from '#function-files'

const parsedCache = new Map<string, SqlFunctionFileConfig>()
let mergedCacheKey = ''
let mergedCache: SqlFunctionSignature[] | null = null

export function invalidateFunctionConfigCache(): void {
    mergedCacheKey = ''
    mergedCache = null
}

function cacheSignature(dialectFile?: string | null): string {
    return dialectFile ?? getActiveSqlDialectFile() ?? 'common'
}

function normalizeFunctionName(value: string): string {
    return value.trim().replace(/\s+/g, '_').toUpperCase()
}

/** 解析 functions-config/*.txt */
export function parseFunctionFile(text: string): SqlFunctionFileConfig {
    const functions: SqlFunctionSignature[] = []
    let inFunctions = false

    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (!line || line.startsWith('#')) continue

        const sectionMatch = /^\[([a-z_]+)\]$/i.exec(line)
        if (sectionMatch) {
            inFunctions = sectionMatch[1].toLowerCase() === 'functions'
            continue
        }

        if (!inFunctions) continue
        const fn = parseFunctionLine(line)
        if (!fn) continue
        if (!functions.some((item) => item.name.toLowerCase() === fn.name.toLowerCase())) {
            functions.push(fn)
        }
    }

    return {functions}
}

export function parseFunctionLine(line: string): SqlFunctionSignature | null {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return null

    const parts = trimmed.split('|').map((part) => part.trim())
    const name = normalizeFunctionName(parts[0] ?? '')
    if (!name || !/^[A-Z_][A-Z0-9_]*$/i.test(name)) return null

    const signature = parts[1] || undefined
    const returns = parts[2] || undefined
    const insertText = parts[3] || undefined
    return {name, signature, returns, insertText}
}

function loadFunctionFile(name: string): SqlFunctionFileConfig {
    const cached = parsedCache.get(name)
    if (cached) return cached

    const path = Object.keys(functionFiles).find((key) => key.endsWith(`/${name}.txt`))
    const config = path ? parseFunctionFile(functionFiles[path]) : {functions: []}
    parsedCache.set(name, config)
    return config
}

function mergeFunctionLists(...lists: SqlFunctionSignature[][]): SqlFunctionSignature[] {
    const byName = new Map<string, SqlFunctionSignature>()
    for (const list of lists) {
        for (const fn of list) {
            byName.set(fn.name.toLowerCase(), fn)
        }
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function resolveDialectFileName(dialectFile?: string | null): string {
    const raw = dialectFile ?? getActiveSqlDialectFile() ?? 'common'
    return resolveSqlDialectFile(raw) ?? raw ?? 'common'
}

/** 合并 common + 当前方言 functions-config */
export function listSqlDialectFunctionSignatures(dialectFile?: string | null): SqlFunctionSignature[] {
    const key = cacheSignature(dialectFile)
    if (mergedCache && mergedCacheKey === key) return mergedCache

    const dialect = resolveDialectFileName(dialectFile)
    const lists: SqlFunctionSignature[][] = [loadFunctionFile('common').functions]
    if (dialect && dialect !== 'common') {
        const dialectFunctions = loadFunctionFile(dialect).functions
        if (dialectFunctions.length) lists.push(dialectFunctions)
    }

    mergedCacheKey = key
    mergedCache = mergeFunctionLists(...lists)
    return mergedCache
}

export function listAvailableFunctionDialectFiles(): string[] {
    return Object.keys(functionFiles)
        .map((path) => path.match(/\/([^/]+)\.txt$/)?.[1])
        .filter((name): name is string => !!name && name !== 'common')
        .sort()
}
