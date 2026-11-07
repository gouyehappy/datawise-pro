const SVG_NS = 'http://www.w3.org/2000/svg'

function sanitizeFileName(name: string): string {
    const trimmed = name.trim() || 'schema-er'
    return trimmed.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_').slice(0, 80)
}

function isTransparentColor(value: string): boolean {
    return !value
        || value === 'none'
        || value === 'transparent'
        || value === 'rgba(0, 0, 0, 0)'
}

function inlineSvgPresentation(source: Element, target: Element) {
    const style = window.getComputedStyle(source)

    const fill = style.fill
    if (!isTransparentColor(fill)) {
        target.setAttribute('fill', fill)
    } else if (source.getAttribute('fill') === 'none') {
        target.setAttribute('fill', 'none')
    }

    const stroke = style.stroke
    if (!isTransparentColor(stroke)) {
        target.setAttribute('stroke', stroke)
    }
    if (style.strokeWidth) {
        target.setAttribute('stroke-width', style.strokeWidth)
    }
    if (style.opacity && style.opacity !== '1') {
        target.setAttribute('opacity', style.opacity)
    }

    if (source instanceof SVGTextElement && target instanceof SVGTextElement) {
        const textFill = !isTransparentColor(fill) ? fill : style.color
        if (!isTransparentColor(textFill)) {
            target.setAttribute('fill', textFill)
        }
        if (style.fontSize) target.setAttribute('font-size', style.fontSize)
        if (style.fontFamily) target.setAttribute('font-family', style.fontFamily)
        if (style.fontWeight) target.setAttribute('font-weight', style.fontWeight)
    }
}

/** 将 scoped CSS / CSS 变量解析为内联属性，便于 SVG/PNG 导出 */
function prepareSvgClone(source: SVGSVGElement): SVGSVGElement {
    const clone = source.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', SVG_NS)

    const viewBox = source.viewBox.baseVal
    const width = Math.max(1, viewBox.width || source.clientWidth || 800)
    const height = Math.max(1, viewBox.height || source.clientHeight || 600)
    clone.setAttribute('width', String(width))
    clone.setAttribute('height', String(height))
    if (!clone.getAttribute('viewBox')) {
        clone.setAttribute('viewBox', `0 0 ${width} ${height}`)
    }

    const sourceNodes = [source, ...source.querySelectorAll('*')]
    const cloneNodes = [clone, ...clone.querySelectorAll('*')]
    for (let index = 0; index < sourceNodes.length; index += 1) {
        const sourceNode = sourceNodes[index]
        const cloneNode = cloneNodes[index]
        if (!(sourceNode instanceof SVGElement) || !(cloneNode instanceof SVGElement)) continue
        inlineSvgPresentation(sourceNode, cloneNode)
    }

    const host = source.closest('.schema-er-graph') ?? source.parentElement
    const background = host
        ? window.getComputedStyle(host).backgroundColor
        : window.getComputedStyle(source).backgroundColor
    if (!isTransparentColor(background)) {
        const bgRect = document.createElementNS(SVG_NS, 'rect')
        bgRect.setAttribute('x', '0')
        bgRect.setAttribute('y', '0')
        bgRect.setAttribute('width', String(width))
        bgRect.setAttribute('height', String(height))
        bgRect.setAttribute('fill', background)
        clone.insertBefore(bgRect, clone.firstChild)
    }

    return clone
}

function serializePreparedSvg(source: SVGSVGElement): string {
    const prepared = prepareSvgClone(source)
    return new XMLSerializer().serializeToString(prepared)
}

function triggerDownload(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 导出当前 ER SVG */
export function exportSchemaErSvg(svg: SVGSVGElement, baseName: string): void {
    const xml = serializePreparedSvg(svg)
    const blob = new Blob([xml], {type: 'image/svg+xml;charset=utf-8'})
    triggerDownload(blob, `${sanitizeFileName(baseName)}.svg`)
}

/** 将 SVG 栅格化为 PNG 后下载 */
export async function exportSchemaErPng(
    svg: SVGSVGElement,
    baseName: string,
    scale = 2,
): Promise<void> {
    const prepared = prepareSvgClone(svg)
    const xml = new XMLSerializer().serializeToString(prepared)
    const viewBox = prepared.viewBox.baseVal
    const width = Math.max(1, viewBox.width || prepared.clientWidth || 800)
    const height = Math.max(1, viewBox.height || prepared.clientHeight || 600)
    const blob = new Blob([xml], {type: 'image/svg+xml;charset=utf-8'})
    const url = URL.createObjectURL(blob)

    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image()
            img.onload = () => resolve(img)
            img.onerror = () => reject(new Error('Failed to rasterize SVG'))
            img.src = url
        })
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(width * scale)
        canvas.height = Math.round(height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas unavailable')
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
        const pngBlob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
                (result) => (result ? resolve(result) : reject(new Error('PNG encode failed'))),
                'image/png',
            )
        })
        triggerDownload(pngBlob, `${sanitizeFileName(baseName)}.png`)
    } finally {
        URL.revokeObjectURL(url)
    }
}
