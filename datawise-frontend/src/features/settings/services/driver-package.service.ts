import type {JdbcDriverCached, JdbcDriverFamily} from '@/features/datasource/types/datasource.types'
import {
    resolveDriverDelivery,
    type DriverDeliveryMode,
} from '@/features/settings/services/runtime-format.service'

/** One installed version / bundle under a driver family. */
export interface DriverVersionEntry {
    id: string
    version: string | null
    kind: 'bundle' | 'jar'
    bundleDir?: string
    primaryPath?: string
    jarCount: number
    sizeBytes: number
    loadedInMemory: boolean
    jars: JdbcDriverCached[]
}

/** Unified driver library row (catalog + cache). */
export interface DriverFamilyGroup {
    id: string
    label: string
    status: 'missing' | 'installed' | 'loaded'
    defaultMaven: string
    driverClass: string
    relatedDbTypes: string[]
    bundle: boolean
    bundleDir?: string | null
    versionCount: number
    jarCount: number
    sizeBytes: number
    loadedInMemory: boolean
    activeVersion: string | null
    versions: DriverVersionEntry[]
    delivery: DriverDeliveryMode
}

export function parseVersionFromJarName(fileName: string): string | null {
    const base = fileName.replace(/\.jar$/i, '')
    const match = base.match(/-(\d+(?:\.\d+)+(?:[-.][\w.]+)?)$/)
    return match?.[1] ?? null
}

function compareVersionsDesc(a: string | null, b: string | null): number {
    if (!a && !b) return 0
    if (!a) return 1
    if (!b) return -1
    const pa = a.split(/[.-]/).map((p) => Number.parseInt(p, 10) || 0)
    const pb = b.split(/[.-]/).map((p) => Number.parseInt(p, 10) || 0)
    const len = Math.max(pa.length, pb.length)
    for (let i = 0; i < len; i++) {
        const da = pa[i] ?? 0
        const db = pb[i] ?? 0
        if (da !== db) return db - da
    }
    return b.localeCompare(a)
}

/** Group installed jars of one family into version rows. */
export function groupFamilyVersions(
    familyId: string,
    jars: JdbcDriverCached[],
    bundle: boolean,
    bundleDir?: string | null,
): DriverVersionEntry[] {
    type Acc = Map<string, DriverVersionEntry>
    const versions: Acc = new Map()

    const add = (
        versionKey: string,
        version: string | null,
        kind: 'bundle' | 'jar',
        jar: JdbcDriverCached,
        dir?: string,
    ) => {
        const existing = versions.get(versionKey)
        if (existing) {
            existing.jars.push(jar)
            existing.jarCount += 1
            existing.sizeBytes += jar.sizeBytes
            existing.loadedInMemory = existing.loadedInMemory || jar.loadedInMemory
            return
        }
        versions.set(versionKey, {
            id: `${familyId}:${versionKey}`,
            version,
            kind,
            bundleDir: dir,
            primaryPath: kind === 'jar' ? jar.relativePath : undefined,
            jarCount: 1,
            sizeBytes: jar.sizeBytes,
            loadedInMemory: jar.loadedInMemory,
            jars: [jar],
        })
    }

    if (bundle && bundleDir) {
        const prefix = `${bundleDir}/`
        for (const jar of jars) {
            if (jar.relativePath === bundleDir || jar.relativePath.startsWith(prefix)) {
                const version = parseVersionFromJarName(jar.fileName)
                add(`bundle:${bundleDir}`, version, 'bundle', jar, bundleDir)
            } else {
                const version = parseVersionFromJarName(jar.fileName)
                add(`jar:${version ?? jar.fileName}`, version, 'jar', jar)
            }
        }
    } else {
        for (const jar of jars) {
            const slash = jar.relativePath.indexOf('/')
            if (slash > 0) {
                const dir = jar.relativePath.slice(0, slash)
                const version = parseVersionFromJarName(jar.fileName)
                add(`bundle:${dir}`, version, 'bundle', jar, dir)
            } else {
                const version = parseVersionFromJarName(jar.fileName)
                add(`jar:${version ?? jar.fileName}`, version, 'jar', jar)
            }
        }
    }

    for (const entry of versions.values()) {
        if (entry.kind !== 'bundle') continue
        const preferred = entry.jars.find((j) => /^hive-jdbc/i.test(j.fileName))
            ?? entry.jars.find((j) => /-jdbc/i.test(j.fileName))
        if (preferred) {
            entry.version = parseVersionFromJarName(preferred.fileName) ?? entry.version
        }
        entry.jars.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    }

    return [...versions.values()].sort((a, b) => compareVersionsDesc(a.version, b.version))
}

/** Map backend catalog families into UI rows (includes missing). */
export function mapCatalogFamilies(families: JdbcDriverFamily[]): DriverFamilyGroup[] {
    return families.map((family) => {
        const versions = groupFamilyVersions(
            family.id,
            family.jars,
            family.bundle,
            family.bundleDir,
        )
        const status = family.status === 'loaded' || family.status === 'installed' || family.status === 'missing'
            ? family.status
            : (family.jars.length === 0 ? 'missing' : family.jars.some((j) => j.loadedInMemory) ? 'loaded' : 'installed')
        return {
            id: family.id,
            label: family.label,
            status,
            defaultMaven: family.defaultMaven,
            driverClass: family.driverClass,
            relatedDbTypes: family.relatedDbTypes ?? [],
            bundle: family.bundle,
            bundleDir: family.bundleDir,
            versionCount: versions.length,
            jarCount: family.jarCount,
            sizeBytes: family.sizeBytes,
            loadedInMemory: status === 'loaded',
            activeVersion: versions[0]?.version
                ?? (family.defaultMaven.includes(':')
                    ? family.defaultMaven.split(':').pop() ?? null
                    : null),
            versions,
            delivery: resolveDriverDelivery(
                family.id,
                family.relatedDbTypes ?? [],
                family.bundle,
                family.delivery,
            ),
        }
    })
}

/**
 * Groups flat JARs into families (used for orphan cache entries not in catalog).
 */
export function groupJdbcDrivers(drivers: JdbcDriverCached[]): DriverFamilyGroup[] {
    const ARTIFACT_LABELS: Array<{match: RegExp; label: string; familyId: string}> = [
        {match: /^mysql-connector/i, label: 'MySQL', familyId: 'mysql'},
        {match: /^mariadb-java-client/i, label: 'MariaDB', familyId: 'mariadb'},
        {match: /^postgresql/i, label: 'PostgreSQL', familyId: 'postgresql'},
        {match: /^mssql-jdbc/i, label: 'SQL Server', familyId: 'sqlserver'},
        {match: /^ojdbc/i, label: 'Oracle', familyId: 'oracle'},
        {match: /^clickhouse/i, label: 'ClickHouse', familyId: 'clickhouse'},
        {match: /^sqlite-jdbc/i, label: 'SQLite', familyId: 'sqlite'},
        {match: /^h2-/i, label: 'H2', familyId: 'h2'},
        {match: /^hive-/i, label: 'Apache Hive', familyId: 'hive'},
        {match: /^libthrift|^libfb303|^hadoop-common/i, label: 'Apache Hive', familyId: 'hive'},
        {match: /^elasticsearch|^x-pack-sql/i, label: 'Elasticsearch', familyId: 'elasticsearch'},
    ]

    const resolveFamily = (fileName: string, bundleDir?: string): {id: string; label: string} => {
        if (bundleDir) {
            return {id: bundleDir.toLowerCase(), label: bundleDir === 'hive' ? 'Apache Hive' : bundleDir === 'kudu' ? 'Apache Kudu' : bundleDir}
        }
        for (const entry of ARTIFACT_LABELS) {
            if (entry.match.test(fileName)) {
                return {id: entry.familyId, label: entry.label}
            }
        }
        const withoutExt = fileName.replace(/\.jar$/i, '')
        const versionCut = withoutExt.match(/^(.*?)-\d/)
        const artifact = versionCut?.[1] ?? withoutExt
        return {id: artifact.toLowerCase(), label: artifact}
    }

    type Acc = {label: string; jars: JdbcDriverCached[]}
    const families = new Map<string, Acc>()

    for (const driver of drivers) {
        const slash = driver.relativePath.indexOf('/')
        const family = slash > 0
            ? resolveFamily(driver.fileName, driver.relativePath.slice(0, slash))
            : resolveFamily(driver.fileName)
        let acc = families.get(family.id)
        if (!acc) {
            acc = {label: family.label, jars: []}
            families.set(family.id, acc)
        }
        acc.jars.push(driver)
    }

    const result: DriverFamilyGroup[] = []
    for (const [id, acc] of families.entries()) {
        const bundle = acc.jars.some((j) => j.relativePath.includes('/'))
        const bundleDir = bundle
            ? acc.jars.find((j) => j.relativePath.includes('/'))?.relativePath.split('/')[0]
            : null
        const versions = groupFamilyVersions(id, acc.jars, !!bundle, bundleDir)
        result.push({
            id,
            label: acc.label,
            status: versions.some((v) => v.loadedInMemory) ? 'loaded' : 'installed',
            defaultMaven: '',
            driverClass: '',
            relatedDbTypes: [],
            bundle: !!bundle,
            bundleDir,
            versionCount: versions.length,
            jarCount: acc.jars.length,
            sizeBytes: acc.jars.reduce((s, j) => s + j.sizeBytes, 0),
            loadedInMemory: versions.some((v) => v.loadedInMemory),
            activeVersion: versions[0]?.version ?? null,
            versions,
            delivery: resolveDriverDelivery(id, [], !!bundle),
        })
    }

    return result.sort((a, b) => a.label.localeCompare(b.label, undefined, {sensitivity: 'base'}))
}

export function collectFamilyDeleteTargets(family: DriverFamilyGroup): {
    bundles: string[]
    jars: string[]
} {
    const bundles: string[] = []
    const jars: string[] = []
    if (family.bundle && family.bundleDir) {
        bundles.push(family.bundleDir)
    }
    for (const version of family.versions) {
        if (version.kind === 'bundle' && version.bundleDir) {
            bundles.push(version.bundleDir)
        } else if (version.primaryPath) {
            jars.push(version.primaryPath)
        } else {
            for (const jar of version.jars) {
                jars.push(jar.relativePath)
            }
        }
    }
    return {bundles: [...new Set(bundles)], jars: [...new Set(jars)]}
}
