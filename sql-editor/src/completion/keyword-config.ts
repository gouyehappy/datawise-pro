import {resolveSqlDialectFile} from '@sql-editor/completion/dialect-aliases'
import {invalidateFunctionConfigCache} from './function-config'

/** 配置文件分段名（仅格式化 fallback 与 SELECT forbidden） */
export type KeywordFileSection = 'forbidden_in_select' | 'format_break_before' | 'format_keywords'

export interface SqlKeywordFileConfig {
    slots: Partial<Record<string, string[]>>
}

import {keywordFiles} from '#keyword-files'

const parsedCache = new Map<string, SqlKeywordFileConfig>()

let activeDialectFile: string | undefined

let mergedConfigCacheKey = ''
let mergedConfigCache: SqlKeywordFileConfig | null = null
let forbiddenSelectCacheKey = ''
let forbiddenSelectCache: Set<string> | null = null

function invalidateKeywordRuntimeCache() {
    mergedConfigCacheKey = ''
    mergedConfigCache = null
    forbiddenSelectCacheKey = ''
    forbiddenSelectCache = null
    invalidateFunctionConfigCache()
}

function mergedConfigCacheSignature(dialectFile?: string | null): string {
    return dialectFile ?? activeDialectFile ?? 'common'
}

/** 切换当前连接的数据源方言（影响格式化关键字） */
export function setSqlCompletionDialect(dialect?: string | null) {
    const next = resolveSqlDialectFile(dialect)
    if (next === activeDialectFile) return
    activeDialectFile = next
    invalidateKeywordRuntimeCache()
}

export function getActiveSqlDialectFile(): string | undefined {
    return activeDialectFile
}

/** 解析 .txt 关键字配置 */
export function parseKeywordFile(text: string): SqlKeywordFileConfig {
    const slots: Partial<Record<string, string[]>> = {}
    let current: string | null = null

    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (!line || line.startsWith('#')) continue

        const sectionMatch = /^\[([a-z_]+)\]$/i.exec(line)
        if (sectionMatch) {
            current = sectionMatch[1].toLowerCase()
            slots[current] ??= []
            continue
        }

        if (!current) continue
        const keyword = normalizeKeyword(line)
        if (!keyword) continue
        slots[current] ??= []
        if (!slots[current]!.some((item) => item.toLowerCase() === keyword.toLowerCase())) {
            slots[current]!.push(keyword)
        }
    }

    return {slots}
}

function normalizeKeyword(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toUpperCase()
}

function loadKeywordFile(name: string): SqlKeywordFileConfig {
    const cached = parsedCache.get(name)
    if (cached) return cached

    const path = Object.keys(keywordFiles).find((key) => key.endsWith(`/${name}.txt`))
    const config = path ? parseKeywordFile(keywordFiles[path]) : {slots: {}}
    parsedCache.set(name, config)
    return config
}

function mergeKeywordConfigs(...configs: SqlKeywordFileConfig[]): SqlKeywordFileConfig {
    const merged: Partial<Record<string, string[]>> = {}

    for (const config of configs) {
        for (const [section, keywords] of Object.entries(config.slots)) {
            if (!keywords?.length) continue
            merged[section] ??= []
            for (const keyword of keywords) {
                const exists = merged[section]!.some((item) => item.toLowerCase() === keyword.toLowerCase())
                if (!exists) merged[section]!.push(keyword)
            }
        }
    }

    return {slots: merged}
}

/** 合并 common + 当前方言配置 */
export function getMergedKeywordConfig(dialectFile?: string | null): SqlKeywordFileConfig {
    const key = mergedConfigCacheSignature(dialectFile)
    if (mergedConfigCache && mergedConfigCacheKey === key) return mergedConfigCache

    const dialect = dialectFile ?? activeDialectFile
    const configs = [loadKeywordFile('common')]
    if (dialect && dialect !== 'common') {
        const dialectConfig = loadKeywordFile(dialect)
        if (Object.keys(dialectConfig.slots).length) {
            configs.push(dialectConfig)
        }
    }
    mergedConfigCacheKey = key
    mergedConfigCache = mergeKeywordConfigs(...configs)
    return mergedConfigCache
}

export function forbiddenInSelectKeywords(dialectFile?: string | null): Set<string> {
    const key = mergedConfigCacheSignature(dialectFile)
    if (forbiddenSelectCache && forbiddenSelectCacheKey === key) return forbiddenSelectCache
    const config = getMergedKeywordConfig(dialectFile)
    forbiddenSelectCacheKey = key
    forbiddenSelectCache = new Set(config.slots.forbidden_in_select ?? [])
    return forbiddenSelectCache
}

/** 格式化用大写关键字列表（common + 方言 format_keywords） */
export function getFormatKeywords(dialectFile?: string | null): string[] {
    const config = getMergedKeywordConfig(dialectFile)
    const all = new Set<string>()
    for (const keyword of config.slots.format_keywords ?? []) {
        all.add(keyword)
    }
    return [...all].sort((a, b) => b.length - a.length)
}

export function getFormatBreakKeywords(dialectFile?: string | null): string[] {
    const config = getMergedKeywordConfig(dialectFile)
    return [...(config.slots.format_break_before ?? [])]
}

/** 补全关键字：common + 方言 format_keywords（不采用 dt-sql-parser 词法关键字） */
export function getCompletionKeywords(dialectFile?: string | null): string[] {
    return getFormatKeywords(dialectFile)
}

/** @deprecated 使用 getCompletionKeywords */
export function getCompletionFallbackKeywords(dialectFile?: string | null): string[] {
    return getCompletionKeywords(dialectFile)
}

/** 已加载的方言配置文件名列表 */
export function listAvailableDialectFiles(): string[] {
    return Object.keys(keywordFiles)
        .map((path) => path.match(/\/([^/]+)\.txt$/)?.[1])
        .filter((name): name is string => !!name && name !== 'common')
        .sort()
}
