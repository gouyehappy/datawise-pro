export interface TableViewOptions {
    showFilter: boolean
    where?: string
    orderBy?: string
}

const TABLE_VIEW_PRESETS: Record<string, TableViewOptions> = {
    categories: {
        showFilter: true,
        where: 'CategoryID > 10',
        orderBy: 'CategoryID DESC',
    },
}

/** 按表名返回结果区展示选项 */
export function resolveTableViewOptions(tableName?: string): TableViewOptions {
    const key = tableName?.toLowerCase() ?? ''
    return TABLE_VIEW_PRESETS[key] ?? {showFilter: false}
}
