/** Package-default page size candidates (host may pass its own via props). */
export const DEFAULT_GRID_PAGE_SIZE_OPTIONS = [50, 100, 200, 500] as const

export function minGridPageSizeOption(options: readonly string[]): string {
  const sorted = [...options].map(String).sort((left, right) => Number(left) - Number(right))
  return sorted[0] ?? String(DEFAULT_GRID_PAGE_SIZE_OPTIONS[0])
}

export function resolveGridPageSizeOption(
  options: readonly string[] = DEFAULT_GRID_PAGE_SIZE_OPTIONS.map(String),
  configured?: number | null,
): string {
  const sorted = [...options].map(String).sort((left, right) => Number(left) - Number(right))
  const min = minGridPageSizeOption(sorted)
  if (!configured || configured <= 0) return min
  const match = sorted.find((option) => Number(option) === configured)
  return match ?? min
}
