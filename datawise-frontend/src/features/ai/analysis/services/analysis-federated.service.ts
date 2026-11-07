export const FEDERATED_SOURCE_COLUMN = '__dw_source__'

export function isFederatedSourceColumn(key: string | undefined | null): boolean {
    return key === FEDERATED_SOURCE_COLUMN
}

export function shouldShowFederatedHint(targetCount: number, columns: { key?: string; name: string }[]): boolean {
    if (targetCount > 1) return true
    return columns.some((column) => isFederatedSourceColumn(column.key ?? column.name))
}
