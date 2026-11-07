/**
 * Build a simple SVG snapshot from ER graph model (Vue Flow nodes are HTML; export cannot clone SVG DOM).
 */
export function buildSchemaErModelSvg(input: {
  width: number
  height: number
  background?: string
  nodes: Array<{
    x: number
    y: number
    width: number
    height: number
    title: string
    columns: Array<{name: string; typeLabel: string; comment?: string}>
  }>
  edges: Array<{
    x1: number
    y1: number
    x2: number
    y2: number
    label?: string
  }>
}): string {
  const bg = input.background || '#1e1e1e'
  const parts: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}">`,
    `<rect width="100%" height="100%" fill="${bg}"/>`,
    `<defs><marker id="er-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill="#8a8a8a"/></marker></defs>`,
  ]

  for (const edge of input.edges) {
    const midX = (edge.x1 + edge.x2) / 2
    const d = `M ${edge.x1} ${edge.y1} C ${midX} ${edge.y1}, ${midX} ${edge.y2}, ${edge.x2} ${edge.y2}`
    parts.push(`<path d="${d}" fill="none" stroke="#8a8a8a" stroke-width="1.5" marker-end="url(#er-arrow)"/>`)
    if (edge.label) {
      parts.push(
          `<text x="${midX}" y="${(edge.y1 + edge.y2) / 2 - 6}" text-anchor="middle" fill="#a0a0a0" font-size="10">${escapeXml(edge.label)}</text>`,
      )
    }
  }

  for (const node of input.nodes) {
    parts.push(
        `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="10" fill="#2a2a2a" stroke="#555"/>`,
    )
    parts.push(
        `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="32" rx="10" fill="#333" stroke="#555"/>`,
    )
    parts.push(
        `<text x="${node.x + node.width / 2}" y="${node.y + 20}" text-anchor="middle" fill="#eee" font-size="12" font-weight="700">${escapeXml(node.title)}</text>`,
    )
    node.columns.forEach((col, index) => {
      const y = node.y + 32 + index * 20 + 14
      parts.push(
          `<text x="${node.x + 10}" y="${y}" fill="#ddd" font-size="11">${escapeXml(col.name)}</text>`,
      )
      parts.push(
          `<text x="${node.x + node.width - 10}" y="${y}" text-anchor="end" fill="#999" font-size="10">${escapeXml(col.typeLabel)}</text>`,
      )
    })
  }

  parts.push(`</svg>`)
  return parts.join('')
}

function escapeXml(value: string): string {
  return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
}

export function downloadSchemaErSvgXml(xml: string, baseName: string): void {
  const blob = new Blob([xml], {type: 'image/svg+xml;charset=utf-8'})
  triggerDownload(blob, `${sanitizeFileName(baseName)}.svg`)
}

export async function downloadSchemaErPngFromSvgXml(xml: string, baseName: string, scale = 2): Promise<void> {
  const blob = new Blob([xml], {type: 'image/svg+xml;charset=utf-8'})
  const url = URL.createObjectURL(blob)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Failed to rasterize SVG'))
      img.src = url
    })
    const width = Math.max(1, image.naturalWidth || 800)
    const height = Math.max(1, image.naturalHeight || 600)
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

function sanitizeFileName(name: string): string {
  const trimmed = name.trim() || 'schema-er'
  return trimmed.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_').slice(0, 80)
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
