export type DeepLinkAction =
    | 'open'
    | 'connection-new'
    | 'ai'
    | 'plugin-install'
    | 'analysis-canvas'

export interface DeepLinkOpenPayload {
    action: DeepLinkAction
    connectionId?: string
    database?: string
    sql?: string
    dbType?: string
    pluginId?: string
}
