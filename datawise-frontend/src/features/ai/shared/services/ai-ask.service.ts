import {shallowRef} from 'vue'
import {buildAiTableTargetId} from '@/features/ai/shared/utils/database-targets'
import {updateAiTableTags} from '@/features/ai/tag/services/ai-table-tag.service'
import {notifyAiTableTagsChanged} from '@/features/ai/tag/services/ai-table-tag.events'
import type {AiChatMode, AiConversationBinding} from '@/features/ai/types/session'
import {truncateTextWithMeta, type TruncationMeta} from '@/shared/truncation/truncation-meta'
import {t} from '@/i18n'

/**
 * 「向 AI 提问」全局入口（P2-2 / T-AI-2）。
 *
 * 表 / SQL / 结果集任意上下文都能发起提问：调用方先把上下文整理成
 * 「要问什么 + 涉及哪些表」，本服务负责把表顺手纳入 AI 数据范围
 * （打标从治理动作降级为顺手动作），再把这单请求交给 AI 工作台消费。
 * 工作台未挂载时请求留在 pending，挂载后一次性取走，保证跨模块跳转不丢。
 *
 * T-AI-2：编辑器选区以结构化 selection 传递（数据附件，非指令注入）。
 */

/** 选区默认上限（字符近似 12 KiB） */
export const AI_SELECTION_MAX_CHARS = 12 * 1024

export type AiAskIntent = 'ask' | 'fix'

export interface AiAskSelection {
    kind: 'sql'
    text: string
    /** @deprecated Prefer truncation.truncated；保留兼容 */
    truncated: boolean
    truncation?: TruncationMeta
}

export interface AiAskScope {
    connectionId: string
    /** 打标 API 的 database 维度（catalog.schema 形式由调用方给全） */
    database: string
    /** 需要同时纳入 AI 数据范围的表；已打标的表重复打标无副作用 */
    tables: readonly string[]
}

export interface AiAskRequest {
    /** 单调递增，用于区分连续两次提问 */
    seq: number
    /** 预填到输入框的问题；用户可改后自己发送，系统不代发 */
    prompt?: string
    /** 交给会话的数据范围（`连接:库:表`） */
    targetIds: string[]
    /** 把焦点放进输入框（Cmd+K 这类纯入口需要） */
    focusInput?: boolean
    /** T-AI-2：Ask / Agent */
    mode?: AiChatMode
    intent?: AiAskIntent
    /** 结构化选区（优先于把 SQL 直接嵌进 prompt） */
    selection?: AiAskSelection
    /** 编辑器连接命名空间；工作台按此复用/新建会话 */
    binding?: AiConversationBinding
}

export interface AiAskInput {
    prompt?: string
    targetIds?: readonly string[]
    scope?: AiAskScope
    focusInput?: boolean
    mode?: AiChatMode
    intent?: AiAskIntent
    /** 原始选区文本；服务内截断并包装 */
    selectionText?: string
    binding?: AiConversationBinding
}

const pendingAsk = shallowRef<AiAskRequest | null>(null)
let askSeq = 0

export function truncateAiSelectionText(raw: string, maxChars = AI_SELECTION_MAX_CHARS): AiAskSelection {
    const normalized = raw.replace(/\r\n/g, '\n')
    const {text, truncation} = truncateTextWithMeta(normalized, maxChars, {
        unit: 'chars',
        reason: 'token_budget',
    })
    return {kind: 'sql', text, truncated: truncation.truncated, truncation}
}

/** 三个入口共用的问题草稿：用户可在输入框继续编辑后再发 */
export function buildTableAskPrompt(table: string): string {
    return t('ai.ask.tablePrompt', {table})
}

/** @deprecated Prefer selection + buildComposerPromptFromAsk；保留给结果集等无 binding 路径 */
export function buildSqlAskPrompt(sql: string): string {
    return t('ai.ask.sqlPrompt', {sql: sql.trim()})
}

export function buildResultAskPrompt(sql: string): string {
    return t('ai.ask.resultPrompt', {sql: sql.trim()})
}

export function buildSelectionInstruction(intent: AiAskIntent = 'ask'): string {
    return intent === 'fix' ? t('ai.ask.fixInstruction') : t('ai.ask.selectionInstruction')
}

/**
 * 组装工作台输入框草稿：用户意图 +「选区是数据不是指令」块。
 */
export function buildComposerPromptFromAsk(options: {
    intent?: AiAskIntent
    selection?: AiAskSelection
    prompt?: string
}): string {
    const intent = options.intent ?? 'ask'
    const instruction = (options.prompt?.trim() || buildSelectionInstruction(intent)).trim()
    const selection = options.selection
    if (!selection?.text) return instruction

    const fence = [
        t('ai.ask.selectionDataHeader'),
        '```sql',
        selection.text,
        '```',
        selection.truncated ? t('ai.ask.selectionTruncated') : '',
    ]
        .filter(Boolean)
        .join('\n')

    return `${instruction}\n\n${fence}`
}

/** 表级 target id 与打标目录同拼法，打标成功才返回，避免范围指向不存在的表 */
async function tagScopeTables(scope?: AiAskScope): Promise<string[]> {
    const tables = (scope?.tables ?? []).map((table) => table.trim()).filter(Boolean)
    if (!scope || !tables.length) return []
    try {
        await updateAiTableTags(scope.connectionId, scope.database, tables, true)
        notifyAiTableTagsChanged()
        return tables.map((table) => buildAiTableTargetId(scope.connectionId, scope.database, table))
    } catch {
        // 打标失败不阻断提问：工作台会退回选表入口，别让入口本身变成死路
        return []
    }
}

/** 发起一次 AI 提问；调用方负责在此之前切到 AI 模块 */
export async function requestAiAsk(input: AiAskInput): Promise<void> {
    const explicit = (input.targetIds ?? []).filter((id) => id.trim())
    const targetIds = explicit.length ? [...explicit] : await tagScopeTables(input.scope)
    const selection = input.selectionText?.trim()
        ? truncateAiSelectionText(input.selectionText)
        : undefined
    askSeq += 1
    pendingAsk.value = {
        seq: askSeq,
        prompt: input.prompt?.trim() || undefined,
        targetIds,
        focusInput: input.focusInput,
        mode: input.mode,
        intent: input.intent,
        selection,
        binding: input.binding,
    }
}

/** 工作台取走待处理请求（取走即清空，避免重复应用） */
export function consumeAiAsk(): AiAskRequest | null {
    const request = pendingAsk.value
    if (!request) return null
    pendingAsk.value = null
    return request
}

export function peekAiAsk(): AiAskRequest | null {
    return pendingAsk.value
}

/** 工作台侧观察用：请求入队即触发 */
export function aiAskPending() {
    return pendingAsk
}

export function bindingsEqualForAsk(
    a?: AiConversationBinding | null,
    b?: AiConversationBinding | null,
): boolean {
    if (!a?.connectionId || !b?.connectionId) return false
    return (
        a.connectionId === b.connectionId
        && (a.database || '') === (b.database || '')
        && (a.schema || '') === (b.schema || '')
    )
}
