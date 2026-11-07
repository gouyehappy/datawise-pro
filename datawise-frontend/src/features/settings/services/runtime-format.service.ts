/** Pure helpers for runtime settings UI (no API imports). */

export function formatRuntimeBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    let value = bytes
    let unit = 0
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024
        unit += 1
    }
    if (unit === 0 || Number.isInteger(value) || value >= 10) {
        return `${Math.round(value)} ${units[unit]}`
    }
    return `${value.toFixed(1)} ${units[unit]}`
}

/** Core tier connector ids matching desktop packaging profile. */
/** Standard Core free connectors (MariaDB via mysql plugin). H2 is pack.connector.enterprise. */
export const CORE_CONNECTOR_IDS = ['mysql', 'postgresql', 'sqlite3'] as const

/** Heavy / multi-JAR families — prefer offline runtime zip (C-10 sidecar). */
export const SIDECAR_DRIVER_FAMILY_IDS = [
    'hive',
    'oracle',
    'sqlserver',
    'elasticsearch',
    'clickhouse',
    'db2',
    'sap',
    'teradata',
    'snowflake',
    'bigquery',
    'redshift',
    'presto',
    'trino',
    'kudu',
] as const

export type DriverDeliveryMode = 'core' | 'on-demand' | 'sidecar'

/** Resolve delivery when API omits it (dev / older backends). */
export function resolveDriverDelivery(
    familyId: string,
    relatedDbTypes: string[] = [],
    bundle = false,
    apiDelivery?: string | null,
): DriverDeliveryMode {
    const fromApi = (apiDelivery || '').trim().toLowerCase()
    if (fromApi === 'core' || fromApi === 'on-demand' || fromApi === 'sidecar') {
        return fromApi
    }
    const related = relatedDbTypes.map((t) => t.trim().toLowerCase())
    if (
        related.some((id) =>
            id === 'mysql' || id === 'mariadb' || id === 'postgresql'
            || id === 'sqlite3' || id === 'sqlite',
        )
    ) {
        return 'core'
    }
    const fid = familyId.trim().toLowerCase()
    if (bundle || (SIDECAR_DRIVER_FAMILY_IDS as readonly string[]).includes(fid)) {
        return 'sidecar'
    }
    return 'on-demand'
}
