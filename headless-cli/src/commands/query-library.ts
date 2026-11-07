import type {Command} from 'commander'
import {DatawiseClient} from '../client.js'
import {resolveConfig} from '../config.js'
import {
    formatValidationReport,
    hasValidationFailures,
    loadQueryLibraryManifest,
    queriesForCiRun,
    resolveManifestRoot,
    validateQueryLibraryManifest,
} from '../query-library/manifest.js'
import {
    formatQueryLibraryRunReport,
    queryLibraryRunExitCode,
    runQueryLibrary,
} from '../query-library/run.js'

export interface QueryLibraryValidateOptions {
    manifest: string
    json?: boolean
    strict?: boolean
}

export interface QueryLibraryRunOptions {
    manifest: string
    id?: string
    json?: boolean
}

export function registerQueryLibraryCommand(program: Command): void {
    const queryLibrary = program
        .command('query-library')
        .description('Validate and run Git-managed Query Library manifests')

    queryLibrary
        .command('validate')
        .description('Validate query-library.json and referenced SQL files (no server required)')
        .requiredOption('-m, --manifest <path>', 'Path to query-library.json')
        .option('--json', 'Print JSON report')
        .option('--strict', 'Treat warnings (e.g. missing connection id) as errors')
        .action((options: QueryLibraryValidateOptions) => {
            const manifest = loadQueryLibraryManifest(options.manifest)
            const issues = validateQueryLibraryManifest(manifest, resolveManifestRoot(options.manifest))
            process.stdout.write(formatValidationReport(issues, !!options.json))
            if (hasValidationFailures(issues, !!options.strict)) {
                process.exit(1)
            }
        })

    queryLibrary
        .command('run')
        .description('Execute CI-enabled queries from a query library manifest')
        .requiredOption('-m, --manifest <path>', 'Path to query-library.json')
        .option('--id <queryId>', 'Run a single query id')
        .option('--json', 'Print JSON report')
        .action(async (options: QueryLibraryRunOptions, command: Command) => {
            const config = resolveConfig(command)
            const manifest = loadQueryLibraryManifest(options.manifest)
            const root = resolveManifestRoot(options.manifest)
            const issues = validateQueryLibraryManifest(manifest, root)
            if (hasValidationFailures(issues, true)) {
                process.stderr.write('Manifest validation failed; run query-library validate --strict for details\n')
                process.exit(1)
            }

            const queries = queriesForCiRun(manifest, options.id)
            if (options.id && !queries.length) {
                throw new Error(`Query id not found or CI disabled: ${options.id}`)
            }
            if (!queries.length) {
                throw new Error('No CI-enabled queries found in manifest')
            }

            const client = new DatawiseClient(config)
            const results = await runQueryLibrary(client, options.manifest, manifest, queries)
            process.stdout.write(formatQueryLibraryRunReport(results, !!options.json))
            process.exit(queryLibraryRunExitCode(results))
        })
}
