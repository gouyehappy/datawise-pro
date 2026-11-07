import type {Command} from 'commander'
import {DatawiseClient} from '../client.js'
import {resolveConfig} from '../config.js'

export function registerRuntimeCommand(program: Command): void {
    const runtime = program.command('runtime').description('Runtime connectors, drivers, and status')

    runtime
        .command('status')
        .description('Show runtime overview (JRE, connectors, drivers)')
        .option('--json', 'Print raw JSON')
        .action(async (options: {json?: boolean}, command: Command) => {
            const client = new DatawiseClient(resolveConfig(command))
            const overview = await client.runtimeOverview()
            if (options.json) {
                process.stdout.write(`${JSON.stringify(overview, null, 2)}\n`)
                return
            }
            process.stdout.write([
                `JRE: ${overview.jre.version || '—'} (${overview.jre.vendor || '—'}) source=${overview.jre.source || '—'}`,
                `  home: ${overview.jre.home || '—'}`,
                `Connectors: ${overview.connectors.installed}/${overview.connectors.catalogTotal}`,
                `Drivers: ${overview.drivers.cachedJars} jar(s)`,
                `Workspace: ${overview.workspace.configDir}`,
                '',
            ].join('\n'))
        })

    runtime
        .command('list')
        .description('List connectors (market) or drivers')
        .argument('<kind>', 'connectors | drivers')
        .option('--json', 'Print raw JSON')
        .action(async (kind: string, options: {json?: boolean}, command: Command) => {
            const client = new DatawiseClient(resolveConfig(command))
            const normalized = kind.trim().toLowerCase()
            if (normalized === 'connectors' || normalized === 'connector') {
                const market = await client.listConnectorMarket()
                if (options.json) {
                    process.stdout.write(`${JSON.stringify(market, null, 2)}\n`)
                    return
                }
                for (const entry of market.connectors) {
                    const status = entry.available ? 'installed' : 'missing'
                    process.stdout.write(`${entry.id}\t${status}\t${entry.label}\n`)
                }
                return
            }
            if (normalized === 'drivers' || normalized === 'driver') {
                const drivers = await client.listDrivers()
                if (options.json) {
                    process.stdout.write(`${JSON.stringify(drivers, null, 2)}\n`)
                    return
                }
                for (const family of drivers.families ?? []) {
                    process.stdout.write(
                        `${family.id}\t${family.status}\t${family.label}\t${family.defaultMaven || ''}\n`,
                    )
                }
                return
            }
            throw new Error(`Unknown list kind "${kind}". Use connectors or drivers.`)
        })

    const install = runtime.command('install').description('Install connector(s) or a JDBC driver')

    install
        .command('connector')
        .description('Install one connector from the marketplace')
        .argument('<id>', 'Connector id (e.g. mysql)')
        .option('--with-drivers', 'Also install default JDBC driver')
        .option('--no-with-drivers', 'Skip JDBC driver install')
        .option('--json', 'Print raw JSON')
        .action(async (
            id: string,
            options: {withDrivers?: boolean; json?: boolean},
            command: Command,
        ) => {
            const withDrivers = options.withDrivers !== false
            const client = new DatawiseClient(resolveConfig(command))
            const result = await client.installConnector(id)
            let driverResult: unknown = null
            if (withDrivers) {
                driverResult = await installDriverForConnector(client, id)
            }
            const payload = {connector: result, driver: driverResult}
            if (options.json) {
                process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
                return
            }
            process.stdout.write(`${result.message}\n`)
            if (driverResult && typeof driverResult === 'object' && driverResult !== null && 'message' in driverResult) {
                process.stdout.write(`${String((driverResult as {message: string}).message)}\n`)
            }
        })

    install
        .command('connectors')
        .description('Install multiple connectors (comma-separated) or --tier core')
        .option('--tier <name>', 'Install by tier (core)')
        .option('--ids <list>', 'Comma-separated connector ids')
        .option('--with-drivers', 'Also install default JDBC drivers')
        .option('--no-with-drivers', 'Skip JDBC driver install')
        .option('--json', 'Print raw JSON')
        .action(async (options: {
            tier?: string
            ids?: string
            withDrivers?: boolean
            json?: boolean
        }, command: Command) => {
            const withDrivers = options.withDrivers !== false
            const client = new DatawiseClient(resolveConfig(command))
            let ids: string[] = []
            if (options.tier?.trim().toLowerCase() === 'core') {
                ids = ['mysql', 'postgresql', 'sqlite3']
            } else if (options.ids?.trim()) {
                ids = options.ids.split(',').map((s) => s.trim()).filter(Boolean)
            } else {
                throw new Error('Provide --tier core or --ids mysql,postgresql')
            }
            const batch = await client.installConnectorsBatch(ids)
            const drivers: unknown[] = []
            if (withDrivers) {
                for (const id of ids) {
                    drivers.push(await installDriverForConnector(client, id))
                }
            }
            const payload = {connectors: batch, drivers}
            if (options.json) {
                process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
                return
            }
            for (const item of batch.results) {
                process.stdout.write(`${item.connectorId}: ${item.message}\n`)
            }
        })

    install
        .command('driver')
        .description('Install a JDBC driver by Maven coordinates')
        .argument('<maven>', 'groupId:artifactId:version')
        .requiredOption('--class <driverClass>', 'JDBC driver class')
        .option('--json', 'Print raw JSON')
        .action(async (
            maven: string,
            options: {class: string; json?: boolean},
            command: Command,
        ) => {
            const client = new DatawiseClient(resolveConfig(command))
            const result = await client.installDriver(maven, options.class)
            if (options.json) {
                process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
                return
            }
            process.stdout.write(
                `Driver ${result.mavenCoordinates} → ${result.localPath}`
                + (result.downloaded ? ' (downloaded)' : ' (cached)')
                + '\n',
            )
        })

    const uninstall = runtime.command('uninstall').description('Uninstall runtime components')
    uninstall
        .command('connector')
        .description('Uninstall a marketplace connector')
        .argument('<id>', 'Connector id')
        .option('--json', 'Print raw JSON')
        .action(async (id: string, options: {json?: boolean}, command: Command) => {
            const client = new DatawiseClient(resolveConfig(command))
            const result = await client.uninstallConnector(id)
            if (options.json) {
                process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
                return
            }
            process.stdout.write(`${result.message}\n`)
        })

    runtime
        .command('import')
        .description('Import connectors/drivers from a local offline zip (admin)')
        .argument('<zipPath>', 'Absolute or relative path to runtime zip on the server host')
        .option('--json', 'Print raw JSON')
        .action(async (zipPath: string, options: {json?: boolean}, command: Command) => {
            const client = new DatawiseClient(resolveConfig(command))
            const result = await client.importRuntimeOffline(zipPath)
            if (options.json) {
                process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
                return
            }
            process.stdout.write(`${result.message}\n`)
            if (result.pluginJars?.length) {
                process.stdout.write(`Plugins: ${result.pluginJars.join(', ')}\n`)
            }
            if (result.driverJars?.length) {
                process.stdout.write(`Drivers: ${result.driverJars.join(', ')}\n`)
            }
        })
}

async function installDriverForConnector(client: DatawiseClient, connectorId: string): Promise<unknown> {
    const drivers = await client.listDrivers()
    const family = (drivers.families ?? []).find((f) =>
        (f.relatedDbTypes ?? []).includes(connectorId) && f.defaultMaven && f.driverClass,
    )
    if (!family) {
        return {ok: false, connectorId, message: `No default JDBC driver for ${connectorId}`}
    }
    try {
        const result = await client.installDriver(family.defaultMaven, family.driverClass)
        return {
            ok: true,
            connectorId,
            message: `Driver ${result.mavenCoordinates} installed`,
            result,
        }
    } catch (err) {
        return {
            ok: false,
            connectorId,
            message: err instanceof Error ? err.message : String(err),
        }
    }
}
