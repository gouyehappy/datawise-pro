/**
 * Shared paths and module lists for desktop packaging.
 */
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const scriptsRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/** datawise-frontend/ */
export const frontendRoot = join(scriptsRoot, '..')
/** monorepo root */
export const repoRoot = join(frontendRoot, '..')
/** datawise-backend/ */
export const backendRoot = join(repoRoot, 'datawise-backend')
/** shared runtime config used by desktop / CLI */
export const repoConfig = join(repoRoot, 'config')

/** Staged desktop payload for JCEF packaging (jpackage / Inno Setup) */
export const desktopBundleRoot = join(frontendRoot, 'resources/desktop')
export const backendBundleOut = join(desktopBundleRoot, 'backend')
export const configBundleOut = join(desktopBundleRoot, 'config-bundle')
export const bundleConfigSrc = join(frontendRoot, 'resources/bundle-config')

export const serverTargetDir = join(backendRoot, 'datawise-server', 'target')
export const releaseDir = join(frontendRoot, 'release')

/**
 * Connector plugins packaged into config/plugins (via Maven antrun) then
 * copied into the desktop bundle.
 * Excludes shared libs (spi / api / jdbc-runtime) and the aggregator module (all).
 */
export const CONNECTOR_MODULES = [
    'datawise-connectors/datawise-connector-mysql',
    'datawise-connectors/datawise-connector-postgresql',
    'datawise-connectors/datawise-connector-kingbase',
    'datawise-connectors/datawise-connector-opengauss',
    'datawise-connectors/datawise-connector-starrocks',
    'datawise-connectors/datawise-connector-doris',
    'datawise-connectors/datawise-connector-redis',
    'datawise-connectors/datawise-connector-kafka',
    'datawise-connectors/datawise-connector-yarn',
    'datawise-connectors/datawise-connector-ssh',
    'datawise-connectors/datawise-connector-mongodb',
    'datawise-connectors/datawise-connector-sqlserver',
    'datawise-connectors/datawise-connector-oracle',
    'datawise-connectors/datawise-connector-dm',
    'datawise-connectors/datawise-connector-oscar',
    'datawise-connectors/datawise-connector-tidb',
    'datawise-connectors/datawise-connector-tdengine',
    'datawise-connectors/datawise-connector-sybase',
    'datawise-connectors/datawise-connector-phoenix',
    'datawise-connectors/datawise-connector-cachedb',
    'datawise-connectors/datawise-connector-h2',
    'datawise-connectors/datawise-connector-hsql',
    'datawise-connectors/datawise-connector-clickhouse',
    'datawise-connectors/datawise-connector-gbase8a',
    'datawise-connectors/datawise-connector-elasticsearch',
    'datawise-connectors/datawise-connector-kylin',
    'datawise-connectors/datawise-connector-greenplum',
    'datawise-connectors/datawise-connector-oceanbase',
    'datawise-connectors/datawise-connector-highgo',
    'datawise-connectors/datawise-connector-db2',
    'datawise-connectors/datawise-connector-sqlite',
    'datawise-connectors/datawise-connector-presto',
    'datawise-connectors/datawise-connector-trino',
    'datawise-connectors/datawise-connector-hive',
    'datawise-connectors/datawise-connector-flink',
    'datawise-connectors/datawise-connector-gaussdb',
]

/** Single Maven -pl list: server JAR + desktop connector plugins. */
export const DESKTOP_BACKEND_MODULES = ['datawise-server', ...CONNECTOR_MODULES]

/**
 * Core / Standard free connectors (PRODUCT_EXTENSION_PACKS §2.1).
 * MySQL plugin also covers MariaDB. Paid connectors (incl. H2) ship via full profile / marketplace.
 */
export const CORE_CONNECTOR_MODULES = [
    'datawise-connectors/datawise-connector-mysql',
    'datawise-connectors/datawise-connector-postgresql',
    'datawise-connectors/datawise-connector-sqlite',
]

/** JAR name prefixes for {@link CORE_CONNECTOR_MODULES} (used when copying into the bundle). */
export const CORE_CONNECTOR_JAR_PREFIXES = [
    'datawise-connector-mysql-',
    'datawise-connector-postgresql-',
    'datawise-connector-sqlite-',
]

export const DESKTOP_PROFILES = ['slim', 'core', 'full']

/** Default desktop packaging profile. */
export const DEFAULT_DESKTOP_PROFILE = 'core'

/**
 * @param {string[]|readonly string[]} [argv]
 * @returns {'slim' | 'core' | 'full'}
 */
export function parseDesktopProfile(argv = process.argv.slice(2)) {
    const idx = argv.indexOf('--profile')
    if (idx >= 0 && argv[idx + 1]) {
        const profile = String(argv[idx + 1]).trim().toLowerCase()
        if (DESKTOP_PROFILES.includes(profile)) {
            return /** @type {'slim' | 'core' | 'full'} */ (profile)
        }
        throw new Error(`Unknown desktop profile "${argv[idx + 1]}". Use: ${DESKTOP_PROFILES.join(' | ')}`)
    }
    const fromEnv = process.env.DATAWISE_DESKTOP_PROFILE?.trim().toLowerCase()
    if (fromEnv && DESKTOP_PROFILES.includes(fromEnv)) {
        return /** @type {'slim' | 'core' | 'full'} */ (fromEnv)
    }
    return DEFAULT_DESKTOP_PROFILE
}

/**
 * @param {'slim' | 'core' | 'full'} profile
 * @returns {string[]}
 */
export function connectorModulesForProfile(profile) {
    if (profile === 'full') return [...CONNECTOR_MODULES]
    if (profile === 'core') return [...CORE_CONNECTOR_MODULES]
    return []
}

/**
 * @param {'slim' | 'core' | 'full'} profile
 * @returns {string[]}
 */
export function backendModulesForProfile(profile) {
    return ['datawise-server', ...connectorModulesForProfile(profile)]
}
