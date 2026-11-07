import type {Command} from 'commander'
import {DatawiseClient} from '../client.js'
import {formatCliError} from '../cli-error.js'
import {formatVisibleConnections} from '../connection-resolve.js'
import {resolveConfig} from '../config.js'

export interface SqlConnectionsOptions {
    json?: boolean
}

export function registerSqlConnectionsCommand(sql: Command): void {
    sql
        .command('connections')
        .description('List connections visible to this API token (owned + team-shared)')
        .option('--json', 'Print JSON')
        .action(async (options: SqlConnectionsOptions, command: Command) => {
            const config = resolveConfig(command)
            const client = new DatawiseClient(config)
            try {
                const connections = await client.listSqlConnections()
                process.stdout.write(formatVisibleConnections(connections, !!options.json))
            } catch (error) {
                throw new Error(formatCliError(error))
            }
        })
}
