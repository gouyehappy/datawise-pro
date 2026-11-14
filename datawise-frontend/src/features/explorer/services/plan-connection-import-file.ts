import type {ConnectionConfig} from '@/core/types'
import {isConnectionProfilePackage} from '@/features/explorer/services/import-connection-file.service'
import {parseConfigSnapshotPayload} from '@/features/settings/services/config-snapshot.service'
import {
    parseThirdPartyConnectionFile,
    type ThirdPartyImportParseResult,
} from '@/features/explorer/services/third-party-connection-import'

export type ConnectionImportPlan =
    | {kind: 'dwprofile'; file: File}
    | {kind: 'native'; connections: ConnectionConfig[]}
    | {kind: 'third-party'; parse: ThirdPartyImportParseResult; fileName: string}

/**
 * Classify a user-picked import file before mutating the catalog.
 */
export async function planConnectionImportFile(file: File): Promise<ConnectionImportPlan> {
    if (isConnectionProfilePackage(file)) {
        return {kind: 'dwprofile', file}
    }
    const text = await file.text()
    const third = parseThirdPartyConnectionFile(text, file.name)
    if (third) {
        return {kind: 'third-party', parse: third, fileName: file.name}
    }
    const parsed = parseConfigSnapshotPayload(text)
    return {kind: 'native', connections: parsed.connections as ConnectionConfig[]}
}
