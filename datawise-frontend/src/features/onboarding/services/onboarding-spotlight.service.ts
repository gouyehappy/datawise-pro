import type {OnboardingTourPlacement} from '@/features/onboarding/services/onboarding-tour.config'

export const SPOTLIGHT_PAD = 10
export const TOOLTIP_WIDTH = 340
export const TOOLTIP_ESTIMATED_HEIGHT = 360
export const VIEWPORT_MARGIN = 16
export const TOOLTIP_GAP = 18

export interface RectBox {
    top: number
    left: number
    width: number
    height: number
}

export interface SpotlightLayout {
    highlight: RectBox | null
    tooltip: RectBox
    arrowSide: 'top' | 'right' | 'bottom' | 'left' | 'none'
    arrowOffset: number
    resolvedPlacement: OnboardingTourPlacement
}

export interface ViewportSize {
    width: number
    height: number
}

export function queryOnboardingTarget(target: string): HTMLElement | null {
    if (typeof document === 'undefined') return null
    return document.querySelector(`[data-onboarding="${target}"]`) as HTMLElement | null
}

export function measureTarget(target: string, pad = SPOTLIGHT_PAD): RectBox | null {
    const element = queryOnboardingTarget(target)
    if (!element) return null
    const rect = element.getBoundingClientRect()
    return {
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
    }
}

export function getViewportSize(): ViewportSize {
    return {
        width: typeof window !== 'undefined' ? window.innerWidth : 1280,
        height: typeof window !== 'undefined' ? window.innerHeight : 720,
    }
}

export function layoutSpotlightTour(
    target: string | undefined,
    placement: OnboardingTourPlacement,
    tooltipWidth = TOOLTIP_WIDTH,
    tooltipHeight = TOOLTIP_ESTIMATED_HEIGHT,
    viewport = getViewportSize(),
): SpotlightLayout {
    if (!target || placement === 'center') {
        return centerLayout(tooltipWidth, tooltipHeight, viewport)
    }

    const highlight = measureTarget(target)
    if (!highlight) {
        return centerLayout(tooltipWidth, tooltipHeight, viewport)
    }

    const candidates = buildPlacementCandidates(placement, highlight, viewport, tooltipWidth, tooltipHeight)
    let best: SpotlightLayout | null = null
    let bestScore = Number.NEGATIVE_INFINITY

    for (const candidate of candidates) {
        const layout = buildAnchoredLayout(highlight, candidate, tooltipWidth, tooltipHeight, viewport)
        const score = scoreLayout(layout, highlight, viewport, candidate === placement)
        if (score > bestScore) {
            bestScore = score
            best = layout
        }
    }

    return best ?? centerLayout(tooltipWidth, tooltipHeight, viewport)
}

function centerLayout(
    tooltipWidth: number,
    tooltipHeight: number,
    viewport: ViewportSize,
): SpotlightLayout {
    return {
        highlight: null,
        tooltip: {
            top: viewport.height / 2 - tooltipHeight / 2,
            left: viewport.width / 2 - tooltipWidth / 2,
            width: tooltipWidth,
            height: tooltipHeight,
        },
        arrowSide: 'none',
        arrowOffset: 0,
        resolvedPlacement: 'center',
    }
}

function buildPlacementCandidates(
    preferred: OnboardingTourPlacement,
    highlight: RectBox,
    viewport: ViewportSize,
    tooltipWidth: number,
    tooltipHeight: number,
): OnboardingTourPlacement[] {
    const nearBottom = highlight.top + highlight.height > viewport.height * 0.72
    const nearTop = highlight.top < viewport.height * 0.22
    const nearLeft = highlight.left + highlight.width < viewport.width * 0.28

    const ordered: OnboardingTourPlacement[] = [preferred]

    if (nearBottom) {
        ordered.push('top', 'left', 'right', 'bottom')
    } else if (nearTop) {
        ordered.push('bottom', 'right', 'left', 'top')
    } else if (nearLeft) {
        ordered.push('right', 'bottom', 'top', 'left')
    } else {
        ordered.push('left', 'bottom', 'top', 'right')
    }

    return [...new Set(ordered.filter((item) => item !== 'center'))]
}

function buildAnchoredLayout(
    highlight: RectBox,
    placement: OnboardingTourPlacement,
    tooltipWidth: number,
    tooltipHeight: number,
    viewport: ViewportSize,
): SpotlightLayout {
    const gap = TOOLTIP_GAP
    let tooltipTop = highlight.top
    let tooltipLeft = highlight.left
    let arrowSide: SpotlightLayout['arrowSide'] = 'left'

    switch (placement) {
        case 'right':
            tooltipLeft = highlight.left + highlight.width + gap
            tooltipTop = highlight.top + highlight.height / 2 - tooltipHeight / 2
            arrowSide = 'left'
            break
        case 'left':
            tooltipLeft = highlight.left - tooltipWidth - gap
            tooltipTop = highlight.top + highlight.height / 2 - tooltipHeight / 2
            arrowSide = 'right'
            break
        case 'bottom':
            tooltipTop = highlight.top + highlight.height + gap
            tooltipLeft = highlight.left + highlight.width / 2 - tooltipWidth / 2
            arrowSide = 'top'
            break
        case 'top':
            tooltipTop = highlight.top - tooltipHeight - gap
            tooltipLeft = highlight.left + highlight.width / 2 - tooltipWidth / 2
            arrowSide = 'bottom'
            break
        default:
            break
    }

    const tooltip = clampTooltip(
        {top: tooltipTop, left: tooltipLeft, width: tooltipWidth, height: tooltipHeight},
        viewport,
    )
    const targetCenterY = highlight.top + highlight.height / 2
    const arrowOffset = arrowSide === 'left' || arrowSide === 'right'
        ? clampArrowOffset(targetCenterY - tooltip.top, tooltipHeight)
        : clampArrowOffset(highlight.left + highlight.width / 2 - tooltip.left, tooltipWidth, true)

    return {
        highlight,
        tooltip,
        arrowSide,
        arrowOffset,
        resolvedPlacement: placement,
    }
}

function clampTooltip(box: RectBox, viewport: ViewportSize): RectBox {
    const margin = VIEWPORT_MARGIN
    return {
        ...box,
        top: Math.max(margin, Math.min(box.top, viewport.height - box.height - margin)),
        left: Math.max(margin, Math.min(box.left, viewport.width - box.width - margin)),
    }
}

function clampArrowOffset(offset: number, size: number, horizontal = false): number {
    const min = horizontal ? 40 : 36
    const max = horizontal ? size - 40 : size - 36
    return Math.max(min, Math.min(offset, max))
}

function scoreLayout(
    layout: SpotlightLayout,
    highlight: RectBox,
    viewport: ViewportSize,
    preferred: boolean,
): number {
    const margin = VIEWPORT_MARGIN
    const {tooltip} = layout
    const fits =
        tooltip.top >= margin &&
        tooltip.left >= margin &&
        tooltip.top + tooltip.height <= viewport.height - margin &&
        tooltip.left + tooltip.width <= viewport.width - margin

    const targetCenterY = highlight.top + highlight.height / 2
    const alignmentPenalty = Math.abs(targetCenterY - (tooltip.top + layout.arrowOffset))

    let score = fits ? 1000 : 0
    if (preferred) score += 120
    score -= alignmentPenalty * 0.6
    score -= Math.max(0, tooltip.top + tooltip.height - (viewport.height - margin)) * 4
    score -= Math.max(0, margin - tooltip.top) * 4
    return score
}

export function spotlightBoxStyle(box: RectBox | null): Record<string, string> | undefined {
    if (!box) return undefined
    return {
        top: `${box.top}px`,
        left: `${box.left}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
    }
}

export function tooltipBoxStyle(box: RectBox, arrowOffset: number): Record<string, string> {
    return {
        top: `${box.top}px`,
        left: `${box.left}px`,
        width: `${box.width}px`,
        '--tour-arrow-offset': `${arrowOffset}px`,
    }
}
