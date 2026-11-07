/** Named start-pane share of the split container width. */
export type DwSplitRatioName = 'sidebar' | 'third' | 'half'

export type DwSplitRatio = DwSplitRatioName | number

export const DW_SPLIT_RATIO_PRESETS: Record<DwSplitRatioName, number> = {
  sidebar: 0.22,
  third: 1 / 3,
  half: 0.5,
}

export function resolveDwSplitRatio(
  ratio: DwSplitRatio | undefined,
  fallback = DW_SPLIT_RATIO_PRESETS.third,
): number {
  if (ratio == null) return fallback
  if (typeof ratio === 'number') {
    if (!Number.isFinite(ratio)) return fallback
    return Math.min(0.85, Math.max(0.12, ratio))
  }
  return DW_SPLIT_RATIO_PRESETS[ratio] ?? fallback
}

export function widthFromRatio(
  containerWidth: number,
  ratio: number,
  min: number,
  max: number,
): number {
  if (containerWidth <= 0) return Math.min(max, Math.max(min, Math.round(min)))
  const raw = Math.round(containerWidth * ratio)
  return Math.min(max, Math.max(min, raw))
}
