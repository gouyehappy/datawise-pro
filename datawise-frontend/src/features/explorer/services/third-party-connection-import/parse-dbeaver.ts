import {inferDbTypeFromJdbc, parseJdbcUrlParts} from './jdbc-url-parts'
import {resolveDbType} from './db-type-map'
import type {ThirdPartyConnectionDraft, ThirdPartyImportParseResult} from './types'

/**
 * Parse DBeaver `data-sources.json`. Does not decrypt `credentials-config.json`.
 */
export function parseDbeaverDataSourcesJson(text: string): ThirdPartyImportParseResult {
    const drafts: ThirdPartyConnectionDraft[] = []
    const skipped: Array<{name: string; reason: string}> = []
    let root: Record<string, unknown>
    try {
        root = JSON.parse(text) as Record<string, unknown>
    } catch {
        return {source: 'dbeaver', drafts: [], skipped: [{name: '', reason: 'invalid JSON'}]}
    }
    const connections = root.connections
    if (!connections || typeof connections !== 'object') {
        return {source: 'dbeaver', drafts: [], skipped: [{name: '', reason: 'missing connections map'}]}
    }
    let i = 0
    for (const [id, raw] of Object.entries(connections as Record<string, unknown>)) {
        i += 1
        const entry = raw as Record<string, unknown>
        const name = String(entry.name ?? id)
        const provider = String(entry.provider ?? '')
        const driver = String(entry.driver ?? '')
        const configuration = (entry.configuration ?? {}) as Record<string, unknown>
        const url = String(configuration.url ?? '')
        const host = String(configuration.host ?? configuration.server ?? '')
        const port = String(configuration.port ?? '')
        const database = String(configuration.database ?? '')
        const authProps = (configuration['auth-properties'] ?? {}) as Record<string, unknown>
        const user = String(
            authProps.user
                ?? authProps['@dbeaver-user']
                ?? configuration.user
                ?? '',
        )
        const savePassword = Boolean(entry['save-password'])
        const hasAuthPropsPassword = Boolean(
            authProps.password || authProps['@dbeaver-password'],
        )
        const parts = parseJdbcUrlParts(url)
        const inferred = inferDbTypeFromJdbc(url, `${provider} ${driver}`)
        const dbType =
            resolveDbType(provider)
            ?? resolveDbType(driver)
            ?? resolveDbType(inferred)
            ?? resolveDbType(parts?.scheme ?? '')
        if (!dbType) {
            skipped.push({name, reason: `unsupported provider: ${provider || driver || 'unknown'}`})
            continue
        }
        drafts.push({
            key: `dbeaver-${id || i}`,
            source: 'dbeaver',
            name,
            dbType,
            host: host || parts?.host || 'localhost',
            port: port || parts?.port || '',
            user,
            database: database || parts?.database || '',
            url,
            passwordOmitted: savePassword || hasAuthPropsPassword || !user,
            vendorType: provider || driver,
        })
    }
    return {source: 'dbeaver', drafts, skipped}
}
