const STORAGE_KEY = 'datawise.mcp.ui-prefs.v1'

export type McpPermissionTier = 'readonly'

export type McpUiPrefs = {
    apiUrl: string
    /** Preferred connection ids shown in generated config comments / future server enforce */
    connectionAllowlist: string[]
    permissionTier: McpPermissionTier
}

const DEFAULT_PREFS: McpUiPrefs = {
    apiUrl: 'http://localhost:18421',
    connectionAllowlist: [],
    permissionTier: 'readonly',
}

export function loadMcpUiPrefs(): McpUiPrefs {
    if (typeof localStorage === 'undefined') return {...DEFAULT_PREFS}
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return {...DEFAULT_PREFS}
        const parsed = JSON.parse(raw) as Partial<McpUiPrefs>
        return {
            apiUrl: typeof parsed.apiUrl === 'string' && parsed.apiUrl.trim()
                ? parsed.apiUrl.trim()
                : DEFAULT_PREFS.apiUrl,
            connectionAllowlist: Array.isArray(parsed.connectionAllowlist)
                ? parsed.connectionAllowlist.map(String).map((s) => s.trim()).filter(Boolean)
                : [],
            permissionTier: 'readonly',
        }
    } catch {
        return {...DEFAULT_PREFS}
    }
}

export function saveMcpUiPrefs(prefs: McpUiPrefs) {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
}

export function buildMcpCursorConfigJson(input: {
    apiUrl: string
    connectionAllowlist: string[]
    permissionTier: McpPermissionTier
}): string {
    const apiUrl = (input.apiUrl || DEFAULT_PREFS.apiUrl).replace(/\/$/, '')
    const allow = input.connectionAllowlist.filter(Boolean)
    const payload = {
        mcpServers: {
            datawise: {
                command: 'npx',
                args: ['-y', '@datawise/mcp-server'],
                env: {
                    DATAWISE_API_URL: apiUrl,
                    DATAWISE_SESSION_ID: '<paste-session-id-or-use-DATAWISE_API_TOKEN>',
                    ...(allow.length
                        ? {
                            DATAWISE_CONNECTION_ALLOWLIST: allow.join(','),
                        }
                        : {}),
                    DATAWISE_PERMISSION_TIER: input.permissionTier,
                },
            },
        },
    }
    return `${JSON.stringify(payload, null, 2)}\n`
}
