import {resolveDbType} from './db-type-map'
import type {ThirdPartyConnectionDraft, ThirdPartyImportParseResult} from './types'

function attr(tag: string, name: string): string {
    const re = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i')
    const m = tag.match(re)
    return m?.[1]?.trim() ?? ''
}

/**
 * Parse Navicat `.ncx` XML. Encrypted Password attributes are never decrypted.
 */
export function parseNavicatNcx(text: string): ThirdPartyImportParseResult {
    const drafts: ThirdPartyConnectionDraft[] = []
    const skipped: Array<{name: string; reason: string}> = []
    const tags = text.match(/<\s*Connection\b[^>]*\/?\s*>/gi) ?? []
    let i = 0
    for (const tag of tags) {
        i += 1
        const name = attr(tag, 'ConnectionName') || attr(tag, 'ConnName') || `Navicat #${i}`
        const connType = attr(tag, 'ConnType') || attr(tag, 'DatabaseType')
        const dbType = resolveDbType(connType)
        if (!dbType) {
            skipped.push({name, reason: `unsupported ConnType: ${connType || 'unknown'}`})
            continue
        }
        const host = attr(tag, 'Host') || attr(tag, 'Server') || 'localhost'
        const port = attr(tag, 'Port') || ''
        const user = attr(tag, 'UserName') || attr(tag, 'User') || ''
        const database = attr(tag, 'Database') || ''
        const password = attr(tag, 'Password')
        drafts.push({
            key: `navicat-${i}-${name}`,
            source: 'navicat',
            name,
            dbType,
            host,
            port,
            user,
            database,
            url: '',
            passwordOmitted: Boolean(password),
            vendorType: connType,
        })
    }
    return {source: 'navicat', drafts, skipped}
}
