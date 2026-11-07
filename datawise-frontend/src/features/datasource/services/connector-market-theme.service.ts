import type {DbType} from '@/core/types'

/** Brand-adjacent accent hues for connector cards and hero orbs. */
const KNOWN_ACCENTS: Partial<Record<DbType, string>> = {
    mysql: '#00758f',
    mariadb: '#003545',
    postgresql: '#336791',
    oracle: '#c74634',
    sqlserver: '#cc2927',
    clickhouse: '#ffcc01',
    redis: '#dc382d',
    mongodb: '#47a248',
    kafka: '#231f20',
    yarn: '#FF9900',
    jenkins: '#D33833',
    nacos: '#00C1DE',
    polaris: '#2B85E4',
    kubernetes: '#326CE5',
    elasticsearch: '#005571',
    hive: '#fdee21',
    kudu: '#f96c00',
    trino: '#dd00a1',
    presto: '#5890ff',
    flink: '#e6526f',
    doris: '#4c7cf3',
    starrocks: '#29abe2',
    tidb: '#e30a34',
    oceanbase: '#002766',
    sqlite: '#0f80cc',
    db2: '#052fad',
    dameng: '#0052d9',
    dm: '#0052d9',
    greenplum: '#3aab58',
    opengauss: '#009688',
    gaussdb: '#009688',
    kylin: '#174196',
    tdengine: '#21c36a',
    sybase: '#008080',
    phoenix: '#333333',
    generic: '#6366f1',
    other: '#64748b',
}

function hashHue(input: string): number {
    let hash = 0
    for (let i = 0; i < input.length; i += 1) {
        hash = (hash * 31 + input.charCodeAt(i)) >>> 0
    }
    return hash % 360
}

export function connectorMarketAccent(dbType: string): string {
    const known = KNOWN_ACCENTS[dbType as DbType]
    if (known) return known
    const hue = hashHue(dbType.toLowerCase())
    return `hsl(${hue} 62% 52%)`
}

export function connectorMarketAccentVars(dbType: string): Record<string, string> {
    const accent = connectorMarketAccent(dbType)
    return {
        '--cm-card-accent': accent,
        '--cm-card-accent-soft': `color-mix(in srgb, ${accent} 14%, transparent)`,
        '--cm-card-accent-border': `color-mix(in srgb, ${accent} 28%, transparent)`,
        '--cm-card-accent-glow': `color-mix(in srgb, ${accent} 22%, transparent)`,
    }
}
