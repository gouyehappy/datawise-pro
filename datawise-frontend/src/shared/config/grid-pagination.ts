import {GRID_PAGE_SIZE_OPTIONS, type GridPageSizeValue} from '@/shared/config/editor-presets'

/** 从候选条目中取数值最小的分页大小 */
export function minGridPageSizeOption(options: readonly string[]): string {
    const sorted = [...options].map(String).sort((left, right) => Number(left) - Number(right))
    return sorted[0] ?? String(GRID_PAGE_SIZE_OPTIONS[0])
}

/**
 * Resolve default page size from candidates.
 * Pass `configured` from editor settings (`defaultGridPageSize`); omit/≤0 falls back to min.
 */
export function resolveGridPageSizeOption(
    options: readonly string[] = GRID_PAGE_SIZE_OPTIONS.map(String),
    configured?: number | null,
): string {
    const sorted = [...options].map(String).sort((left, right) => Number(left) - Number(right))
    const min = minGridPageSizeOption(sorted)
    if (!configured || configured <= 0) return min
    const match = sorted.find((option) => Number(option) === configured)
    return match ?? min
}

export function isGridPageSizeValue(value: number): value is GridPageSizeValue {
    return GRID_PAGE_SIZE_OPTIONS.some((option) => option === value)
}
