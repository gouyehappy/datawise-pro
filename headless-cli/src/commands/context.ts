import type {Command} from 'commander'
import {DatawiseClient} from '../client.js'
import {formatCliError} from '../cli-error.js'
import {resolveConfig} from '../config.js'
import {resolveConnectionRef} from '../connection-resolve.js'
import {truncationMeta, type TruncationMeta} from '../truncation-meta.js'

export interface ContextOptions {
    database?: string
    schema?: string
    tables?: string
    maxTables?: string
    json?: boolean
}

interface ContextColumn {
    name: string
    type: string
    nullable: boolean
    primaryKey: boolean
    comment?: string
}

interface ContextTable {
    name: string
    columns: ContextColumn[]
}

interface ContextPacket {
    schemaVersion: 1
    generatedAt: string
    connection: {
        id: string
        name: string
        dialect?: string
        environment?: string
        access: string
    }
    database?: string
    schema?: string
    maxTables: number
    /** @deprecated Prefer truncation.truncated */
    truncated: boolean
    /** T-TRUNC-1 */
    truncation: TruncationMeta
    missingTables?: string[]
    tables: ContextTable[]
}

function clampMaxTables(raw: string | undefined): number {
    const n = raw ? Number.parseInt(raw, 10) : 8
    if (!Number.isFinite(n)) return 8
    return Math.min(20, Math.max(1, Math.trunc(n)))
}

function formatMarkdown(packet: ContextPacket): string {
    const lines: string[] = [
        `# DataWise context: ${packet.connection.name} (${packet.connection.id})`,
        '',
        `- dialect: ${packet.connection.dialect ?? ''}`,
        `- env: ${packet.connection.environment ?? ''}`,
        `- access: ${packet.connection.access}`,
        `- database: ${packet.database ?? ''}`,
        packet.truncated ? `- truncated: true (raise --max-tables or pass --tables)` : '',
        '',
    ].filter(Boolean)

    for (const table of packet.tables) {
        lines.push(`## ${table.name}`)
        for (const col of table.columns) {
            const flags = [
                col.primaryKey ? 'PK' : '',
                col.nullable ? 'NULL' : 'NOT NULL',
            ].filter(Boolean).join(', ')
            const comment = col.comment ? ` — ${col.comment.slice(0, 80)}` : ''
            lines.push(`- ${col.name}: ${col.type} (${flags})${comment}`)
        }
        lines.push('')
    }
    return `${lines.join('\n')}\n`
}

export function registerContextCommand(program: Command): void {
    program
        .command('context')
        .description('Emit a token-efficient schema packet for AI agents (read-only)')
        .argument('<connection>', 'Connection id or unique name')
        .option('--database <db>', 'Database / catalog')
        .option('--schema <schema>', 'Schema name (informational; passed when API supports it)')
        .option('--tables <list>', 'Comma-separated table names')
        .option('--max-tables <n>', 'Max tables (default 8, clamp 1–20)', '8')
        .option('--json', 'Print JSON ContextPacket')
        .action(async (connectionRef: string, options: ContextOptions, command: Command) => {
            const config = resolveConfig(command)
            const client = new DatawiseClient(config)
            try {
                const connections = await client.listSqlConnections()
                const connection = resolveConnectionRef(connectionRef, connections)
                const maxTables = clampMaxTables(options.maxTables)
                const requested = (options.tables ?? '')
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)

                const listed = await client.listSchemaTables(connection.id, options.database)
                const allNames = (listed.tables ?? [])
                    .map((t) => (t as {tableName?: string; name?: string}).tableName
                        ?? (t as {name?: string}).name
                        ?? '')
                    .filter(Boolean)
                let selected: string[]
                const missingTables: string[] = []
                if (requested.length) {
                    const lower = new Map(allNames.map((n) => [n.toLowerCase(), n]))
                    selected = []
                    for (const name of requested) {
                        const hit = lower.get(name.toLowerCase())
                        if (hit) selected.push(hit)
                        else missingTables.push(name)
                    }
                } else {
                    selected = allNames.slice(0, maxTables)
                }

                const truncated = !requested.length && allNames.length > selected.length
                const selectedCapped = selected.slice(0, maxTables)
                const wasTruncated = truncated || selected.length > maxTables
                const tables: ContextTable[] = []
                for (const name of selectedCapped) {
                    const props = await client.fetchTableProperties(connection.id, options.database, name)
                    tables.push({
                        name,
                        columns: (props.columns ?? []).map((col) => {
                            const keyType = String((col as {keyType?: string}).keyType ?? '').toUpperCase()
                            return {
                                name: col.name ?? '',
                                type: col.dataType ?? col.type ?? '',
                                nullable: Boolean(col.nullable),
                                primaryKey: keyType.includes('PRI') || keyType === 'PRIMARY' || Boolean(col.primaryKey),
                                comment: col.comment || undefined,
                            }
                        }),
                    })
                }

                const packet: ContextPacket = {
                    schemaVersion: 1,
                    generatedAt: new Date().toISOString(),
                    connection: {
                        id: connection.id,
                        name: connection.name ?? connection.id,
                        dialect: connection.dbType ?? undefined,
                        environment: connection.env ?? undefined,
                        access: connection.access ?? '',
                    },
                    database: options.database ?? listed.database ?? undefined,
                    schema: options.schema,
                    maxTables,
                    truncated: wasTruncated,
                    truncation: truncationMeta(
                        wasTruncated,
                        requested.length ? selected.length : allNames.length,
                        maxTables,
                        'tables',
                        'token_budget',
                    ),
                    missingTables: missingTables.length ? missingTables : undefined,
                    tables,
                }

                process.stdout.write(
                    options.json ? `${JSON.stringify(packet, null, 2)}\n` : formatMarkdown(packet),
                )
            } catch (error) {
                throw new Error(formatCliError(error))
            }
        })
}
