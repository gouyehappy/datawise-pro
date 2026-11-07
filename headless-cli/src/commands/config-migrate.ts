import type {Command} from 'commander'
import {DatawiseClient} from '../client.js'
import {resolveConfig} from '../config.js'
import type {LegacyConfigMigrationStatus} from '../types.js'

export interface ConfigMigrateOptions {
    dryRun?: boolean
    json?: boolean
}

function formatStatus(status: LegacyConfigMigrationStatus, json: boolean): string {
    if (json) {
        return `${JSON.stringify(status, null, 2)}\n`
    }
    const lines = [
        `pending: ${status.pendingCount}`,
        `migrated: ${status.migrated?.length ?? 0}`,
    ]
    for (const item of status.pending ?? []) {
        lines.push(`  pending  ${item.legacyRelativePath} -> ${item.targetRelativePath}`)
    }
    for (const item of status.migrated ?? []) {
        lines.push(`  migrated ${item.legacyRelativePath} -> ${item.targetRelativePath}`)
    }
    return `${lines.join('\n')}\n`
}

export function registerConfigMigrateCommand(program: Command): void {
    const config = program.command('config').description('Config directory maintenance')
    config
        .command('migrate')
        .description('Migrate deprecated config paths to tenant-scoped layouts')
        .option('--dry-run', 'Only report pending paths (GET status)')
        .option('--json', 'Print raw JSON')
        .action(async (options: ConfigMigrateOptions, command: Command) => {
            const cli = resolveConfig(command)
            const client = new DatawiseClient(cli)
            const status = options.dryRun
                ? await client.getConfigMigrationStatus()
                : await client.applyConfigMigration()
            process.stdout.write(formatStatus(status, !!options.json))
            process.exit(status.pendingCount > 0 && options.dryRun ? 2 : 0)
        })
}
