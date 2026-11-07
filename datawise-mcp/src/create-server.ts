#!/usr/bin/env node
import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'

const BASE_URL = (process.env.DATAWISE_API_URL ?? 'http://localhost:18421').replace(/\/$/, '')
const SESSION_ID = process.env.DATAWISE_SESSION_ID ?? ''
const API_TOKEN = process.env.DATAWISE_API_TOKEN ?? ''

const packageJson = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'),
) as {version?: string}
export const MCP_VERSION = typeof packageJson.version === 'string' ? packageJson.version : '0.0.0'

/** Stable tool catalog — smoke tests assert this list stays complete. */
export const MCP_TOOL_NAMES = [
    'get_workbench_context',
    'list_connections',
    'list_tables',
    'review_sql',
    'execute_readonly_sql',
    'compare_schema',
    'list_semantic_metrics',
    'rerun_canvas',
    'generate_federated_sql',
    'propose_open_console',
] as const

export const SESSION_HEADER = 'X-DW-Session-Id'
export const API_TOKEN_HEADER = 'X-DW-Api-Token'

export function buildAuthHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...extra,
    }
    if (SESSION_ID) headers[SESSION_HEADER] = SESSION_ID
    if (API_TOKEN) headers[API_TOKEN_HEADER] = API_TOKEN
    return headers
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = buildAuthHeaders(init?.headers as Record<string, string> | undefined)
    const response = await fetch(`${BASE_URL}${path}`, {...init, headers})
    const body = await response.json() as {code?: number; data?: T; msg?: string}
    if (!response.ok || (body.code != null && body.code !== 0)) {
        throw new Error(body.msg ?? `HTTP ${response.status}`)
    }
    return body.data as T
}

/** Build the MCP server with all DataWise tools registered (no transport). */
export function createDatawiseMcpServer(): McpServer {
    const server = new McpServer({
        name: 'datawise',
        version: MCP_VERSION,
    })

    server.tool(
        'get_workbench_context',
        'Read the live DataWise UI focus (active connection, open tabs, editor preview). Call this before guessing connectionId.',
        {
            includeBodyPreview: z.boolean().optional(),
        },
        async ({includeBodyPreview}) => {
            const params = new URLSearchParams()
            if (includeBodyPreview === false) {
                params.set('includeBodyPreview', 'false')
            }
            const qs = params.toString()
            const path = `/api/platform/mcp/workbench-context${qs ? `?${qs}` : ''}`
            const snapshot = await apiFetch<unknown>(path)
            return {content: [{type: 'text', text: JSON.stringify(snapshot, null, 2)}]}
        },
    )

    server.tool(
        'list_connections',
        'List visible database connections in DataWise',
        {},
        async () => {
            const rows = await apiFetch<Array<Record<string, string>>>('/api/platform/mcp/connections')
            return {content: [{type: 'text', text: JSON.stringify(rows, null, 2)}]}
        },
    )

    server.tool(
        'list_tables',
        'List tables for a connection and database',
        {
            connectionId: z.string(),
            database: z.string(),
        },
        async ({connectionId, database}) => {
            const params = new URLSearchParams({connectionId, database})
            const tables = await apiFetch<string[]>(`/api/platform/mcp/schema/tables?${params}`)
            return {content: [{type: 'text', text: JSON.stringify(tables, null, 2)}]}
        },
    )

    server.tool(
        'review_sql',
        'Review SQL for safety issues before execution',
        {
            sql: z.string(),
            connectionId: z.string(),
            database: z.string().optional(),
        },
        async (args) => {
            const result = await apiFetch<unknown>('/api/platform/mcp/sql/review', {
                method: 'POST',
                body: JSON.stringify(args),
            })
            return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}]}
        },
    )

    server.tool(
        'execute_readonly_sql',
        'Execute read-only SQL through DataWise safety layer',
        {
            sql: z.string(),
            connectionId: z.string(),
            database: z.string().optional(),
            maxRows: z.number().optional(),
        },
        async (args) => {
            const result = await apiFetch<unknown>('/api/platform/mcp/sql/execute-readonly', {
                method: 'POST',
                body: JSON.stringify({
                    sql: args.sql,
                    connectionId: args.connectionId,
                    database: args.database,
                    maxRows: args.maxRows ?? 200,
                }),
            })
            return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}]}
        },
    )

    server.tool(
        'compare_schema',
        'Compare schema drift between source and target environments',
        {
            sourceConnectionId: z.string(),
            sourceDatabase: z.string().optional(),
            targetConnectionId: z.string(),
            targetDatabase: z.string().optional(),
            tablePattern: z.string().optional(),
        },
        async (args) => {
            const result = await apiFetch<unknown>('/api/platform/mcp/schema-drift/compare', {
                method: 'POST',
                body: JSON.stringify(args),
            })
            return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}]}
        },
    )

    server.tool(
        'list_semantic_metrics',
        'List semantic layer metrics for a connection/database',
        {
            connectionId: z.string(),
            database: z.string(),
        },
        async ({connectionId, database}) => {
            const params = new URLSearchParams({connectionId, database})
            const result = await apiFetch<unknown>(`/api/platform/mcp/semantic-metrics?${params}`)
            return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}]}
        },
    )

    server.tool(
        'rerun_canvas',
        'Rerun an analysis canvas with optional parameter values',
        {
            canvasId: z.string(),
            parameterValues: z.record(z.string()).optional(),
        },
        async (args) => {
            const result = await apiFetch<unknown>('/api/platform/mcp/canvas/rerun', {
                method: 'POST',
                body: JSON.stringify(args),
            })
            return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}]}
        },
    )

    server.tool(
        'generate_federated_sql',
        'Generate cross-source federated SQL from natural language',
        {
            prompt: z.string(),
            sources: z.array(z.object({
                alias: z.string(),
                connectionId: z.string(),
                database: z.string().optional(),
            })),
        },
        async (args) => {
            const result = await apiFetch<unknown>('/api/platform/mcp/invoke', {
                method: 'POST',
                body: JSON.stringify({tool: 'generate_federated_sql', arguments: args}),
            })
            return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}]}
        },
    )

    server.tool(
        'propose_open_console',
        'Propose opening a DataWise SQL console with optional SQL. Returns dw_confirm — user must approve in the DataWise UI.',
        {
            connectionId: z.string().optional(),
            database: z.string().optional(),
            sql: z.string().optional(),
            title: z.string().optional(),
        },
        async (args) => {
            const result = await apiFetch<unknown>('/api/platform/mcp/invoke', {
                method: 'POST',
                body: JSON.stringify({tool: 'propose_open_console', arguments: args}),
            })
            return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}]}
        },
    )

    return server
}

/** Registered tool names from the McpServer private registry (SDK-compatible smoke helper). */
export function registeredToolNames(server: McpServer): string[] {
    const registry = (server as unknown as {_registeredTools?: Record<string, unknown>})._registeredTools
    if (registry && typeof registry === 'object') {
        return Object.keys(registry).sort()
    }
    return []
}
