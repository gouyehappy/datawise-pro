import {inferDbTypeFromJdbc, parseJdbcUrlParts} from './jdbc-url-parts'
import {resolveDbType} from './db-type-map'
import type {ThirdPartyConnectionDraft, ThirdPartyImportParseResult} from './types'

function attr(tag: string, name: string): string {
    const re = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i')
    const m = tag.match(re)
    return m?.[1]?.trim() ?? ''
}

function childText(block: string, tag: string): string {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i')
    const m = block.match(re)
    return m?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim() ?? ''
}

/**
 * Parse JetBrains / DataGrip `dataSources.xml` (or clipboard `#DataSourceSettings#` snippets).
 * Passwords are never present in shared XML — mark omitted when user-name exists.
 */
export function parseDataGripDataSourcesXml(text: string): ThirdPartyImportParseResult {
    const drafts: ThirdPartyConnectionDraft[] = []
    const skipped: Array<{name: string; reason: string}> = []
    const blocks = text.match(/<\s*data-source\b[\s\S]*?<\/\s*data-source\s*>/gi) ?? []
    let i = 0
    for (const block of blocks) {
        i += 1
        const openTag = block.match(/<\s*data-source\b[^>]*>/i)?.[0] ?? ''
        const name = attr(openTag, 'name') || `DataGrip #${i}`
        const jdbcUrl = childText(block, 'jdbc-url')
        const driverRef = childText(block, 'driver-ref')
        const userName = childText(block, 'user-name')
        const parts = parseJdbcUrlParts(jdbcUrl)
        const inferred = inferDbTypeFromJdbc(jdbcUrl, driverRef)
        const dbType = resolveDbType(driverRef) ?? resolveDbType(inferred) ?? resolveDbType(parts?.scheme ?? '')
        if (!dbType || dbType === 'generic' && !jdbcUrl) {
            skipped.push({name, reason: `unsupported driver: ${driverRef || inferred || 'unknown'}`})
            continue
        }
        const host = parts?.host || 'localhost'
        const port = parts?.port || ''
        const database = parts?.database || ''
        drafts.push({
            key: `datagrip-${i}-${name}`,
            source: 'datagrip',
            name,
            dbType: dbType === 'generic' ? resolveDbType(inferred) ?? 'generic' : dbType,
            host,
            port,
            user: userName,
            database,
            url: jdbcUrl,
            passwordOmitted: true,
            vendorType: driverRef || inferred,
        })
    }
    return {source: 'datagrip', drafts, skipped}
}
