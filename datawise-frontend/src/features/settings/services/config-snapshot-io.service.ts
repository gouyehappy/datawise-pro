import {configApi} from '@/api/modules/config'
import {explorerApi} from '@/api/modules/explorer'
import {workspacePanelApi} from '@/api/modules/workspace-panel'
import type {ConnectionConfig} from '@/core/types'
import {
    buildConfigSnapshot,
    downloadConfigSnapshot,
    parseConfigSnapshotPayload,
    type ConfigSnapshotSavedSql,
} from '@/features/settings/services/config-snapshot.service'

export async function exportConfigSnapshot(options?: {includePasswords?: boolean}): Promise<{
    connectionCount: number
    savedConsoleCount: number
}> {
    const [catalog, consoles] = await Promise.all([
        configApi.fetchConnectionsCatalog(),
        workspacePanelApi.fetchSavedConsoles(),
    ])
    const connections = catalog.connections.map((entry) => entry.config)
    const savedConsoles: ConfigSnapshotSavedSql[] = consoles.map((item) => ({
        name: item.name,
        connectionName: item.connectionName,
        sql: item.sql ?? '',
        folder: item.folder,
        tags: item.tags,
    }))
    const snapshot = buildConfigSnapshot({
        connections,
        savedConsoles,
        includePasswords: options?.includePasswords === true,
    })
    downloadConfigSnapshot(snapshot)
    return {
        connectionCount: snapshot.connections.length,
        savedConsoleCount: snapshot.savedConsoles.length,
    }
}

export async function importConfigSnapshotText(text: string): Promise<{
    connectionCount: number
    savedConsoleCount: number
}> {
    const parsed = parseConfigSnapshotPayload(text)
    let connectionCount = 0
    if (parsed.connections.length) {
        const result = await explorerApi.importConnections(parsed.connections as ConnectionConfig[])
        connectionCount = result.count
    }
    let savedConsoleCount = 0
    for (const item of parsed.savedConsoles) {
        if (!item.name?.trim() || !item.sql?.trim()) continue
        await workspacePanelApi.saveConsole({
            name: item.name,
            connectionName: item.connectionName || 'imported',
            sql: item.sql,
            folder: item.folder,
            tags: item.tags,
        })
        savedConsoleCount += 1
    }
    return {connectionCount, savedConsoleCount}
}

export function pickConfigSnapshotFile(): Promise<File | null> {
    return new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json,application/json'
        input.style.display = 'none'
        document.body.appendChild(input)
        let settled = false
        const finish = (file: File | null) => {
            if (settled) return
            settled = true
            input.remove()
            resolve(file)
        }
        input.onchange = () => finish(input.files?.[0] ?? null)
        input.click()
    })
}
