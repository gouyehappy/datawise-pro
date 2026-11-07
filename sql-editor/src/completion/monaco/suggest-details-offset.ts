/** 纯函数：算二级面板相对 Monaco 自然位置的 translateY */
export function computeSuggestDetailsTranslateY(input: {
    detailsTop: number
    detailsHeight: number
    rowTop: number
    rowHeight: number
    arrowTop: number
    clampTop: number
    clampBottom: number
}): number {
    const {detailsTop, detailsHeight, rowTop, rowHeight, arrowTop, clampTop, clampBottom} = input
    const desiredTop = rowTop + rowHeight / 2 - arrowTop
    let ty = desiredTop - detailsTop

    if (detailsHeight > clampBottom - clampTop) {
        return clampTop - detailsTop
    }

    let nextTop = detailsTop + ty
    if (nextTop < clampTop) ty += clampTop - nextTop
    nextTop = detailsTop + ty
    if (nextTop + detailsHeight > clampBottom) {
        ty = clampBottom - detailsHeight - detailsTop
    }
    return ty
}
