import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import type {PluginItem} from '@/core/types'
import {auditPluginCatalogConsistency} from '@/features/plugin/services/plugin-catalog-audit.service'
import {
    auditPluginCatalogMetadata,
    buildPluginCatalogRegistryDiffCsv,
    buildPluginCatalogRegistryDiffRows,
} from '@/features/plugin/services/plugin-catalog-metadata.service'
import {resolvePluginCatalogAuditExitCode} from '@/features/plugin/services/plugin-navigation.service'
import {PLUGIN_IDS} from '@/features/plugin/services/plugin-registry.service'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const defaultCatalogPath = path.resolve(
    scriptDir,
    '../../datawise-backend/datawise-workspace/src/main/resources/seed/plugins.json',
)

function resolveCatalogPath(): string {
    const arg = process.argv.find((item) => item.startsWith('--catalog='))
    return arg ? arg.slice('--catalog='.length) : defaultCatalogPath
}

function loadCatalog(catalogPath: string): PluginItem[] {
    const raw = fs.readFileSync(catalogPath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
        throw new Error(`Expected JSON array in ${catalogPath}`)
    }
    return parsed as PluginItem[]
}

function printReport(
    catalogPath: string,
    catalogItems: PluginItem[],
    consistencyIssues: ReturnType<typeof auditPluginCatalogConsistency>,
    metadataIssues: ReturnType<typeof auditPluginCatalogMetadata>,
    strict: boolean,
): void {
    console.log(`Plugin catalog audit: ${catalogPath}`)
    console.log(`  catalog entries: ${catalogItems.length}`)
    console.log(`  registry ids:    ${PLUGIN_IDS.length}`)
    console.log(`  mode:            ${strict ? 'strict' : 'default'}`)

    if (consistencyIssues.length === 0 && metadataIssues.length === 0) {
        console.log('  status: OK')
        return
    }

    const metadataOnly = consistencyIssues.length === 0 && metadataIssues.length > 0
    if (metadataOnly && !strict) {
        console.log('  status: METADATA WARNINGS (use --strict to fail)')
    } else {
        console.log('  status: ISSUES FOUND')
    }

    for (const issue of consistencyIssues) {
        console.log(`  - [${issue.kind}] ${issue.id}${issue.detail ? ` (${issue.detail})` : ''}`)
    }
    for (const issue of metadataIssues) {
        const prefix = strict ? 'metadata' : 'metadata:warn'
        console.log(`  - [${prefix}:${issue.kind}] ${issue.id} (${issue.detail})`)
    }
}

function main(): void {
    const csvMode = process.argv.includes('--csv')
    const strict = process.argv.includes('--strict')
    const catalogPath = resolveCatalogPath()
    const catalogItems = loadCatalog(catalogPath)

    const consistencyIssues = auditPluginCatalogConsistency(catalogItems)
    const metadataIssues = auditPluginCatalogMetadata(catalogItems)

    if (csvMode) {
        const rows = buildPluginCatalogRegistryDiffRows(catalogItems)
        process.stdout.write(buildPluginCatalogRegistryDiffCsv(rows))
    } else {
        printReport(catalogPath, catalogItems, consistencyIssues, metadataIssues, strict)
    }

    const exitCode = resolvePluginCatalogAuditExitCode({
        consistencyIssueCount: consistencyIssues.length,
        metadataIssueCount: metadataIssues.length,
        strict,
    })
    process.exit(exitCode)
}

main()
