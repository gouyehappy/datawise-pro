import type {AppConfigFile} from '@/shared/config/app-config.types'

const JSON_SECTIONS = [
    'theme',
    'editor',
    'window',
    'layout',
    'explorer',
    'workspace',
    'localFiles',
    'profile',
    'ai',
    'plugins',
    'shortcuts',
    'sqlEditorShortcutsShared',
    'sqlEditorShortcuts',
] as const

type JsonSection = (typeof JSON_SECTIONS)[number]

function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

function readSectionJson(root: Element, tagName: JsonSection): unknown {
    const node = root.getElementsByTagName(tagName).item(0)
    if (!node?.textContent?.trim()) return undefined
    try {
        return JSON.parse(node.textContent)
    } catch {
        return undefined
    }
}

export function serializeAppConfigXml(config: AppConfigFile): string {
    const lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<datawise-app version="${config.version}" exported-at="${escapeXml(config.exportedAt)}">`,
    ]
    if (config.locale) {
        lines.push(`  <locale>${escapeXml(config.locale)}</locale>`)
    }
    for (const section of JSON_SECTIONS) {
        const value = config[section]
        if (value == null) continue
        const json = JSON.stringify(value)
        lines.push(`  <${section} format="json"><![CDATA[${json}]]></${section}>`)
    }
    lines.push('</datawise-app>')
    return `${lines.join('\n')}\n`
}

export function parseAppConfigXml(text: string): AppConfigFile | null {
    try {
        const doc = new DOMParser().parseFromString(text, 'application/xml')
        const root = doc.documentElement
        if (!root || root.tagName !== 'datawise-app') return null

        const versionRaw = root.getAttribute('version')
        const version = versionRaw === '1' || versionRaw === '2' ? Number(versionRaw) : 2
        const exportedAt = root.getAttribute('exported-at') ?? new Date().toISOString()
        const localeNode = root.getElementsByTagName('locale').item(0)
        const locale = localeNode?.textContent?.trim()

        const partial: Record<string, unknown> = {
            version,
            exportedAt,
        }
        if (locale === 'zh-CN' || locale === 'en-US') {
            partial.locale = locale
        }
        for (const section of JSON_SECTIONS) {
            const value = readSectionJson(root, section)
            if (value != null) partial[section] = value
        }
        return partial as unknown as AppConfigFile
    } catch {
        return null
    }
}
