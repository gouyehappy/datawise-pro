import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

/** Mirror of product matrix transactionalDdl for headless CLI (T-SCHEMA-1). */
function loadTransactionalDdlTypes(): Set<string> {
    try {
        const here = dirname(fileURLToPath(import.meta.url))
        const raw = JSON.parse(
            readFileSync(join(here, 'generated', 'transactional-ddl-types.json'), 'utf8'),
        ) as {types?: string[]}
        const types = Array.isArray(raw.types) ? raw.types : []
        const set = new Set(types.map((t) => t.trim().toLowerCase()))
        // Common aliases used in CLI connection metadata
        if (set.has('postgresql')) set.add('postgres')
        return set
    } catch {
        return new Set([
            'postgresql',
            'postgres',
            'kingbase',
            'opengauss',
            'gaussdb',
            'greenplum',
            'highgo',
            'sqlite',
            'h2',
            'hsql',
        ])
    }
}

const TRANSACTIONAL_DDL_TYPES = loadTransactionalDdlTypes()

export type DeployAtomicity = 'guaranteed_rollback' | 'partial_effects_possible'

export function classifyDialectTransactionalDdl(dbType: string | undefined | null): boolean {
    if (!dbType) return false
    return TRANSACTIONAL_DDL_TYPES.has(dbType.trim().toLowerCase())
}

export function classifyStructureDeployAtomicity(options: {
    dbType?: string | null
    includesDdl: boolean
}): DeployAtomicity {
    if (!options.includesDdl) return 'guaranteed_rollback'
    return classifyDialectTransactionalDdl(options.dbType)
        ? 'guaranteed_rollback'
        : 'partial_effects_possible'
}
