import type {SqlCompletionSlot} from '@sql-editor/types'

/**
 * SQL 补全槽位在设置面板中的展示顺序。
 * 与补全上下文枚举一致，保证「芯片 / 词 / 片段」分组顺序统一。
 */
export const SQL_COMPLETION_SLOT_ORDER: readonly SqlCompletionSlot[] = [
    'statement_start',
    'select_list',
    'from',
    'join',
    'on',
    'where',
    'group_by',
    'having',
    'order_by',
    'tail',
    'set',
    'values',
    'insert_columns',
    'update_table',
    'column_ref',
] as const

/**
 * 槽位 → 色调 class 后缀（`tone-*`）。
 * hint bar 与 settings 共用，避免两处维护色板。
 */
export const COMPLETION_SLOT_TONE_CLASSES: Partial<Record<SqlCompletionSlot, string>> = {
    statement_start: 'tone-default',
    select_list: 'tone-select',
    from: 'tone-from',
    join: 'tone-join',
    on: 'tone-on',
    where: 'tone-where',
    group_by: 'tone-group',
    having: 'tone-having',
    order_by: 'tone-order',
    tail: 'tone-tail',
    set: 'tone-default',
    values: 'tone-default',
    insert_columns: 'tone-default',
    update_table: 'tone-default',
    column_ref: 'tone-on',
}

/** 返回槽位 badge 的 `tone-*` class 名。 */
export function completionSlotToneClass(slot: SqlCompletionSlot): string {
    return COMPLETION_SLOT_TONE_CLASSES[slot] ?? 'tone-default'
}

/**
 * 从片段/芯片的 slots 数组中解析「主槽位」——按展示顺序取第一个命中项。
 */
export function resolvePrimaryCompletionSlot(
    slots: readonly SqlCompletionSlot[],
    fallback: SqlCompletionSlot = 'statement_start',
): SqlCompletionSlot {
    return SQL_COMPLETION_SLOT_ORDER.find((key) => slots.includes(key)) ?? slots[0] ?? fallback
}

export type SlotGroupedItems<T> = {
    slot: SqlCompletionSlot
    items: T[]
}

/**
 * 将列表按补全槽位分组，并按 `SQL_COMPLETION_SLOT_ORDER` 输出非空组。
 */
export function groupItemsByCompletionSlot<T>(
    items: readonly T[],
    resolveSlot: (item: T) => SqlCompletionSlot,
    compare?: (a: T, b: T) => number,
): SlotGroupedItems<T>[] {
    const groups = new Map<SqlCompletionSlot, T[]>()
    for (const slot of SQL_COMPLETION_SLOT_ORDER) {
        groups.set(slot, [])
    }

    for (const item of items) {
        const slot = resolveSlot(item)
        if (!groups.has(slot)) groups.set(slot, [])
        groups.get(slot)!.push(item)
    }

    return SQL_COMPLETION_SLOT_ORDER.map((slot) => {
        const bucket = groups.get(slot) ?? []
        const sorted = compare ? [...bucket].sort(compare) : bucket
        return {slot, items: sorted}
    }).filter((group) => group.items.length > 0)
}
