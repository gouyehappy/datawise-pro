/** Hex dump helpers for binary cell preview. */

export function bytesToHexDump(bytes: Uint8Array, bytesPerRow = 16): string {
  const lines: string[] = []
  for (let offset = 0; offset < bytes.length; offset += bytesPerRow) {
    const slice = bytes.subarray(offset, Math.min(offset + bytesPerRow, bytes.length))
    const hex = Array.from(slice, (b) => b.toString(16).padStart(2, '0')).join(' ')
    const ascii = Array.from(slice, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('')
    lines.push(`${offset.toString(16).padStart(8, '0')}  ${hex.padEnd(bytesPerRow * 3 - 1, ' ')}  |${ascii}|`)
  }
  return lines.join('\n')
}

/** Decode common binary cell encodings into bytes. */
export function decodeBinaryCellContent(raw: string): Uint8Array | null {
  const trimmed = raw.trim()
  if (!trimmed) return new Uint8Array()
  if (/^data:[^;]+;base64,/i.test(trimmed)) {
    const b64 = trimmed.slice(trimmed.indexOf(',') + 1)
    return base64ToBytes(b64)
  }
  if (/^[0-9a-fA-F\s]+$/.test(trimmed) && trimmed.replace(/\s/g, '').length % 2 === 0) {
    const hex = trimmed.replace(/\s/g, '')
    const out = new Uint8Array(hex.length / 2)
    for (let i = 0; i < out.length; i++) {
      out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    }
    return out
  }
  try {
    return base64ToBytes(trimmed)
  } catch {
    return null
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const normalized = b64.replace(/\s/g, '')
  const bin = atob(normalized)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function detectImageMimeFromBytes(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
  ) {
    return 'image/png'
  }
  if (bytes.length >= 6) {
    const header = String.fromCharCode(...bytes.subarray(0, 6))
    if (header.startsWith('GIF87a') || header.startsWith('GIF89a')) return 'image/gif'
  }
  if (
    bytes.length >= 12
    && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
  ) {
    return 'image/webp'
  }
  return null
}

export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return `data:${mime};base64,${btoa(binary)}`
}
