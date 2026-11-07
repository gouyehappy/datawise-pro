import type {SimpleIcon} from 'simple-icons'
import {svgPathBbox} from 'svg-path-bbox'
import {
    siApachedoris,
    siApacheflink,
    siApachehive,
    siApachekafka,
    siApachekylin,
    siClickhouse,
    siElasticsearch,
    siH2database,
    siHuawei,
    siSap,
    siMariadb,
    siMongodb,
    siMysql,
    siPostgresql,
    siPresto,
    siRedis,
    siSqlite,
    siTidb,
    siTrino,
} from 'simple-icons'
import {
    DB2_PATH,
    OCEANBASE_PATH,
    ORACLE_PATH,
    SQLSERVER_PATH,
    TDENGINE_PATH,
} from './db-brand-icon-paths'

export interface DbBrandIconLayer {
    path: string
    fill: string
}

export interface DbBrandIcon {
    title: string
    hex: string
    path: string
    /** 官方双色/多色 Logo（优先于单色 path 渲染） */
    layers?: DbBrandIconLayer[]
    /** 无官方矢量时的字母徽标（1–3 字符，品牌色渲染） */
    label?: string
    /** 归一化缩放，使各品牌图标视觉尺寸一致 */
    scale: number
    cx: number
    cy: number
}

/** 24×24 画布中的目标图形尺寸 */
const GLYPH_SIZE = 20

function bboxFromPaths(paths: string[]): [number, number, number, number] {
    if (paths.length === 0) return [0, 0, 24, 24]

    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const path of paths) {
        const [left, top, right, bottom] = svgPathBbox(path)
        x0 = Math.min(x0, left)
        y0 = Math.min(y0, top)
        x1 = Math.max(x1, right)
        y1 = Math.max(y1, bottom)
    }
    return [x0, y0, x1, y1]
}

function normalizeIcon(icon: DbBrandIconSource): DbBrandIcon {
    const layerPaths = icon.layers?.map((layer) => layer.path) ?? []
    const paths = layerPaths.length > 0 ? layerPaths : icon.path ? [icon.path] : []
    const [x0, y0, x1, y1] = bboxFromPaths(paths)
    const maxDim = Math.max(x1 - x0, y1 - y0, 1)
    return {
        title: icon.title,
        hex: icon.hex,
        path: icon.path ?? paths[0] ?? '',
        layers: icon.layers,
        label: icon.label,
        scale: GLYPH_SIZE / maxDim,
        cx: (x0 + x1) / 2,
        cy: (y0 + y1) / 2,
    }
}

function fromSimpleIcon(icon: SimpleIcon): DbBrandIcon {
    return normalizeIcon({
        title: icon.title,
        hex: `#${icon.hex}`,
        path: icon.path,
    })
}

type DbBrandIconSource = {
    title: string
    hex: string
    path?: string
    layers?: DbBrandIconLayer[]
    label?: string
}

/** simple-icons 未收录的品牌：有官方矢量的用 path/layers，否则用品牌色字母徽标 */
const CUSTOM_ICONS: Record<string, DbBrandIconSource> = {
    oracle: {
        title: 'Oracle',
        hex: '#EA1B22',
        path: ORACLE_PATH,
    },
    sqlserver: {
        title: 'SQL Server',
        hex: '#CC2927',
        path: SQLSERVER_PATH,
    },
    dm: {
        title: 'DM (达梦)',
        hex: '#2563EB',
        label: 'DM',
    },
    db2: {
        title: 'IBM Db2',
        hex: '#0F62FE',
        path: DB2_PATH,
    },
    oceanbase: {
        title: 'OceanBase',
        hex: '#0181FD',
        path: OCEANBASE_PATH,
    },
    kingbase: {
        title: 'KingBase',
        hex: '#DC2626',
        label: 'KB',
    },
    greenplum: {
        title: 'Greenplum',
        hex: '#3D8B5C',
        label: 'GP',
    },
    opengauss: {
        title: 'openGauss',
        hex: '#2563EB',
        label: 'OG',
    },
    gbase8a: {
        title: 'GBase 8a',
        hex: '#059669',
        label: 'G8',
    },
    oscar: {
        title: 'Oscar (神通)',
        hex: '#E11D48',
        label: 'OS',
    },
    highgo: {
        title: 'HighGo (瀚高)',
        hex: '#005BAC',
        label: 'HG',
    },
    tdengine: {
        title: 'TDengine',
        hex: '#0041CE',
        path: TDENGINE_PATH,
    },
    sybase: {
        title: 'Sybase (SAP)',
        hex: '#0070F2',
        path: siSap.path,
    },
    phoenix: {
        title: 'Apache Phoenix',
        hex: '#F97316',
        label: 'PHX',
    },
    kudu: {
        title: 'Apache Kudu',
        hex: '#F96C00',
        label: 'KDU',
    },
    cachedb: {
        title: 'InterSystems Caché',
        hex: '#333695',
        label: 'Ca',
    },
    hsql: {
        title: 'HSQLDB',
        hex: '#B45309',
        label: 'HSQ',
    },
    gaussdb: {
        title: 'GaussDB',
        hex: '#C7000B',
        path: siHuawei.path,
    },
    starrocks: {
        title: 'StarRocks',
        hex: '#01808F',
        layers: [
            {
                fill: '#01808F',
                path: 'M11.8,26.4c-0.1,2.2,0.9,3.4,2.3,4.5c9,7.4,18,14.8,27,22.2c2.5,2.1,2.7,3.5,1,6.2c-4.4,6.7-8.8,13.4-13.2,20.1c-1.7,2.5-3.2,2.9-5.9,1.4c-2.8-1.6-5.6-3.2-8.4-4.8c-3.2-1.8-4.8-4.6-4.8-8.3c0-11.8,0-23.6,0-35.5C9.8,30.2,10.3,28.4,11.8,26.4z',
            },
            {
                fill: '#01808F',
                path: 'M87.9,73.8c0.6-2.3-0.5-3.5-1.9-4.6c-9-7.4-17.9-14.7-26.8-22.1c-2.9-2.4-3.1-3.6-1.1-6.7c4.3-6.6,8.7-13.2,13-19.8c1.7-2.6,3.3-2.9,6-1.4c2.8,1.6,5.6,3.2,8.3,4.8c3.2,1.8,4.7,4.5,4.7,8.2c0,11.9,0,23.7,0,35.6C90.2,69.9,89.6,71.9,87.9,73.8z',
            },
            {
                fill: '#01808F',
                path: 'M67.1,56.8c0.6,0.4,17.3,14.1,17.5,14.3c2.4,2.2,2.2,4.1-0.6,5.8C76.8,81,57.3,92.1,54.8,93.6c-3.2,1.9-6.4,1.9-9.6,0c-4.6-2.7-9.2-5.3-13.8-8c-2.2-1.3-2.2-2.7,0-3.9C42.3,75.5,53.1,69.2,64,63C66.5,61.6,68.2,60.1,67.1,56.8z',
            },
            {
                fill: '#FEBD02',
                path: 'M32.9,43.2c-0.6-0.4-17.3-14.1-17.5-14.3c-2.4-2.2-2.2-4.1,0.6-5.8C23.2,19,42.7,7.9,45.2,6.4c3.2-1.9,6.4-1.9,9.6,0c4.6,2.7,9.2,5.3,13.8,8c2.2,1.3,2.2,2.7,0,3.9C57.7,24.5,46.9,30.8,36,37C33.5,38.4,31.8,39.9,32.9,43.2z',
            },
        ],
    },
    yarn: {
        title: 'YARN',
        hex: '#FF9900',
        label: 'YRN',
    },
    jenkins: {
        title: 'Jenkins',
        hex: '#D33833',
        label: 'JKS',
    },
    nacos: {
        title: 'Nacos',
        hex: '#00C1DE',
        label: 'NAC',
    },
    polaris: {
        title: 'Polaris',
        hex: '#2B85E4',
        label: 'POL',
    },
    kubernetes: {
        title: 'Kubernetes',
        hex: '#326CE5',
        label: 'K8S',
    },
    ssh: {
        title: 'SSH',
        hex: '#0EA5E9',
        label: 'SSH',
    },
    plugin: {
        title: 'Community Plugin',
        hex: '#64748B',
        label: 'P',
    },
}

const SIMPLE_ICON_MAP: Record<string, SimpleIcon> = {
    mysql: siMysql,
    mariadb: siMariadb,
    postgresql: siPostgresql,
    clickhouse: siClickhouse,
    mongodb: siMongodb,
    redis: siRedis,
    sqlite: siSqlite,
    hive: siApachehive,
    kafka: siApachekafka,
    presto: siPresto,
    trino: siTrino,
    flink: siApacheflink,
    doris: siApachedoris,
    tidb: siTidb,
    elasticsearch: siElasticsearch,
    kylin: siApachekylin,
    h2: siH2database,
}

const ALIASES: Record<string, string> = {
    postgres: 'postgresql',
    'sql-server': 'sqlserver',
    microsoftsqlserver: 'sqlserver',
    mssql: 'sqlserver',
    'apache-doris': 'doris',
    'apache-hive': 'hive',
    'apache-kudu': 'kudu',
    'apache-kafka': 'kafka',
    'apache-flink': 'flink',
    dameng: 'dm',
}

const GENERIC_ICON: DbBrandIcon = normalizeIcon({
    title: 'Database',
    hex: '#64748b',
    path: 'M12 4.5c-4.8 0-8.7 1.4-8.7 3.2v9.6c0 1.8 3.9 3.2 8.7 3.2s8.7-1.4 8.7-3.2V7.7c0-1.8-3.9-3.2-8.7-3.2zm0 2c3.8 0 6.7.9 6.7 1.2S15.8 9 12 9s-6.7-.9-6.7-1.3S8.2 6.5 12 6.5z',
})

function normalizeDbType(value: string): string {
    return value.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

function resolveIconKey(dbType: string): string {
    const normalized = normalizeDbType(dbType)
    return ALIASES[normalized] ?? normalized
}

function parseHex(hex: string): [number, number, number] {
    const raw = hex.replace('#', '').trim()
    const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
    return [
        Number.parseInt(full.slice(0, 2), 16),
        Number.parseInt(full.slice(2, 4), 16),
        Number.parseInt(full.slice(4, 6), 16),
    ]
}

function rgbToHex(r: number, g: number, b: number): string {
    return `#${[r, g, b]
        .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0'))
        .join('')}`
}

function mixWithWhite(hex: string, amount: number): string {
    const [r, g, b] = parseHex(hex)
    return rgbToHex(
        r + (255 - r) * amount,
        g + (255 - g) * amount,
        b + (255 - b) * amount,
    )
}

function luminance(hex: string): number {
    const [r, g, b] = parseHex(hex).map((value) => {
        const channel = value / 255
        return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** 深色背景下对比度更高的品牌色 */
const DARK_THEME_FILLS: Partial<Record<string, string>> = {
    mysql: '#6EC4E8',
    mariadb: '#6EC4E8',
    postgresql: '#7BA7FF',
    kafka: '#E5E7EB',
    oracle: '#FF6B6B',
    sqlserver: '#F87171',
    clickhouse: '#FACC15',
    mongodb: '#6EE77A',
    redis: '#FF6B5E',
    sqlite: '#38BDF8',
    hive: '#FCD34D',
    presto: '#93C5FD',
    trino: '#F472B6',
    flink: '#FB923C',
    doris: '#A5B4FC',
    dm: '#60A5FA',
    db2: '#60A5FA',
    oceanbase: '#38BDF8',
    kingbase: '#F87171',
    greenplum: '#4ADE80',
    opengauss: '#60A5FA',
    gbase8a: '#34D399',
    elasticsearch: '#22D3EE',
    kylin: '#FBBF24',
    tidb: '#F87171',
    h2: '#38BDF8',
    gaussdb: '#FF6B6B',
    highgo: '#60A5FA',
    cachedb: '#818CF8',
    hsql: '#FBBF24',
    oscar: '#FB7185',
}

export function resolveDbBrandIconColor(dbType: string, dark: boolean): string {
    const icon = resolveDbBrandIcon(dbType)
    if (!dark) return icon.hex

    const key = resolveIconKey(dbType)
    const override = DARK_THEME_FILLS[key]
    if (override) return override

    const lum = luminance(icon.hex)
    if (lum < 0.35) return mixWithWhite(icon.hex, 0.55)
    if (lum < 0.5) return mixWithWhite(icon.hex, 0.28)
    return icon.hex
}

const iconCache = new Map<string, DbBrandIcon>()

export function resolveDbBrandIcon(dbType: string): DbBrandIcon {
    const normalized = normalizeDbType(dbType)
    const cached = iconCache.get(normalized)
    if (cached) return cached

    const key = resolveIconKey(dbType)
    const simple = SIMPLE_ICON_MAP[key]
    const icon = simple
        ? fromSimpleIcon(simple)
        : CUSTOM_ICONS[key]
            ? normalizeIcon(CUSTOM_ICONS[key])
            : GENERIC_ICON

    iconCache.set(normalized, icon)
    if (key !== normalized) iconCache.set(key, icon)
    return icon
}
