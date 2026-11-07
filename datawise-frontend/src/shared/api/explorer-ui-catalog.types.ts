export interface ConnectorExplorerFeature {
    id: string
    nodeType: string
    openKind: string
    menuId: string
    icon: string
    labelKey: string
    order: number
    /** When false, omit from connection feature tree. Null/undefined ⇒ true. */
    showInTree?: boolean | null
    /** When false, omit from connection open menu. Null/undefined ⇒ true. */
    showInMenu?: boolean | null
    /**
     * Overrides default tree node id `{connectionId}:{dbType}:feature:{id}`.
     * Prefer a leading colon suffix (e.g. `:ssh-terminal`, `:k8s:feature:pods`).
     */
    treeNodeIdSuffix?: string | null
}

export interface ConnectorExplorerUiProfile {
    dbType: string
    features: ConnectorExplorerFeature[]
}

export interface ConnectorExplorerUiCatalog {
    profiles: ConnectorExplorerUiProfile[]
}

export function includeExplorerFeatureInTree(feature: ConnectorExplorerFeature): boolean {
    return feature.showInTree !== false
}

export function includeExplorerFeatureInMenu(feature: ConnectorExplorerFeature): boolean {
    return feature.showInMenu !== false
}
