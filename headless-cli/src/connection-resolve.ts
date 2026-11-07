import type {SqlVisibleConnection} from './types.js'

/** Resolve --connection by id or unique name (case-insensitive). */
export function resolveConnectionRef(
    ref: string,
    connections: readonly SqlVisibleConnection[],
): SqlVisibleConnection {
    const trimmed = ref.trim()
    if (!trimmed) {
        throw new Error('Connection id or name is required')
    }
    const byId = connections.find((item) => item.id === trimmed)
    if (byId) return byId

    const needle = trimmed.toLowerCase()
    const byName = connections.filter((item) => (item.name ?? '').trim().toLowerCase() === needle)
    if (byName.length === 1) return byName[0]!
    if (byName.length > 1) {
        const ids = byName.map((item) => item.id).join(', ')
        throw new Error(`Ambiguous connection name "${trimmed}" (ids: ${ids}). Use --connection <id>.`)
    }
    throw new Error(
        `Connection not found: ${trimmed}. Run \`datawise sql connections\` to list owned and team-shared connections.`,
    )
}

export function formatVisibleConnections(
    connections: readonly SqlVisibleConnection[],
    json: boolean,
): string {
    if (json) {
        return `${JSON.stringify(connections, null, 2)}\n`
    }
    if (connections.length === 0) {
        return 'No visible connections for this API token user.\n'
    }
    const lines = [
        'ID\tNAME\tDB\tENV\tACCESS\tSHARED',
        ...connections.map((item) =>
            [
                item.id,
                item.name ?? '',
                item.dbType ?? '',
                item.env ?? '',
                item.access ?? '',
                item.shared ? 'yes' : 'no',
            ].join('\t'),
        ),
        '',
    ]
    return lines.join('\n')
}
