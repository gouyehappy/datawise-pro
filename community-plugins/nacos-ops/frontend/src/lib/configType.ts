/** Resolve display/editor type from dataId extension or explicit type. */
export function resolveConfigType(dataId?: string, type?: string): string {
  const ext = String(dataId || '')
    .match(/\.([a-z0-9]+)$/i)?.[1]
    ?.toLowerCase()
  const fromExt: Record<string, string> = {
    yml: 'yaml',
    yaml: 'yaml',
    json: 'json',
    xml: 'xml',
    html: 'html',
    properties: 'properties',
    props: 'properties',
    toml: 'toml',
    ini: 'ini',
    conf: 'text',
    txt: 'text',
  }
  if (ext && fromExt[ext]) return fromExt[ext]
  return String(type || 'text').toLowerCase() || 'text'
}

/** CSS tone token for type badges / editor prefs. */
export function configTypeTone(type?: string): string {
  const t = String(type || '').toLowerCase()
  if (t === 'json') return 'json'
  if (t === 'yaml' || t === 'yml') return 'yaml'
  if (t === 'xml' || t === 'html') return 'markup'
  if (t === 'properties' || t === 'ini' || t === 'toml') return 'props'
  return 'text'
}
