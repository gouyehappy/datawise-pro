/** Live UI focus snapshot — mirrors backend WorkbenchContextSnapshot. */
export interface WorkbenchContextSnapshot {
    schemaVersion: 1
    updatedAt: string
    publisher: 'web' | 'desktop' | 'unknown'
    online: boolean
    focus: WorkbenchContextFocus
    activeTab?: WorkbenchContextActiveTab | null
    openTabs: WorkbenchContextOpenTab[]
    selection?: WorkbenchContextSelection | null
    pluginFocus?: WorkbenchContextPluginFocus[]
    privacy: {
        secretsRedacted: true
        bodyPreviewMaxChars: number
        pluginTailMaxChars: number
    }
}

export interface WorkbenchContextFocus {
    surface: 'explorer' | 'workspace' | 'ai' | 'settings' | 'plugin' | 'other'
    connectionId?: string
    connectionName?: string
    database?: string
    schema?: string
    dialect?: string
    environment?: string
    objectKind?: 'table' | 'view' | 'collection' | 'topic' | 'file' | 'namespace' | 'other'
    objectName?: string
    pluginId?: string
    workbenchId?: string
    /** Local file path for editor tabs (Markdown / text). */
    resourcePath?: string
}

export interface WorkbenchContextActiveTab {
    id: string
    type: string
    title: string
    connectionId?: string
    database?: string
    localFilePath?: string
    bodyPreview?: string
    bodyTruncated?: boolean
    bodyLength?: number
}

export interface WorkbenchContextOpenTab {
    id: string
    type: string
    title: string
    connectionId?: string
    database?: string
}

export interface WorkbenchContextSelection {
    aiTaggedTables?: Array<{connectionId: string; database: string; table: string}>
    explorerPath?: string[]
}

export interface WorkbenchContextPluginFocus {
    pluginId: string
    kind: string
    summary: string
    ref?: Record<string, string>
    tailPreview?: string
}

/** SQL console body preview (keep modest for schema-heavy prompts). */
export const WORKBENCH_CONTEXT_BODY_MAX = 8 * 1024
/** Local markdown / text files — large enough for typical docs the assistant should rewrite. */
export const WORKBENCH_CONTEXT_LOCAL_TEXT_BODY_MAX = 128 * 1024
export const WORKBENCH_CONTEXT_OPEN_TABS_MAX = 32
