#!/usr/bin/env node
import {Command} from 'commander'
import {registerConfigMigrateCommand} from './commands/config-migrate.js'
import {registerMigrateRunCommand} from './commands/migrate-run.js'
import {registerProjectCommand} from './commands/project.js'
import {registerQueryLibraryCommand} from './commands/query-library.js'
import {registerRuntimeCommand} from './commands/runtime.js'
import {formatCliError} from './cli-error.js'
import {registerSqlConnectionsCommand} from './commands/sql-connections.js'
import {registerSqlExecCommand} from './commands/sql-exec.js'

const program = new Command('datawise')
    .description('DataWise headless CLI for CI and automation')
    .version('4.1.7')
    .option('--server <url>', 'Backend base URL', process.env.DATAWISE_SERVER ?? 'http://localhost:18421')
    .option('--token <token>', 'API token (or DATAWISE_API_TOKEN env)')

const migrate = program.command('migrate').description('Table migration commands')
registerMigrateRunCommand(migrate)

const sql = program.command('sql').description('SQL execution commands')
registerSqlConnectionsCommand(sql)
registerSqlExecCommand(sql)

registerQueryLibraryCommand(program)
registerConfigMigrateCommand(program)
registerRuntimeCommand(program)
registerProjectCommand(program)

program.parseAsync(process.argv).catch((error: unknown) => {
    console.error(`Error: ${formatCliError(error)}`)
    process.exit(1)
})
