export function buildConsoleSaveName(connectionName: string, instanceName?: string | null): string {
    return instanceName ? `${connectionName} · ${instanceName}` : connectionName
}
