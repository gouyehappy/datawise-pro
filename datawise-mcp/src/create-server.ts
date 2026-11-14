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
    'describe_table',
    'get_schema_context',
    'get_sample_data',
    'explain_query',
    'review_sql',
    'validate_sql',
    'list_relations',
    'query_status',
    'cancel_query',
    'execute_readonly_sql',
    'compare_schema',
    'list_semantic_metrics',
    'rerun_canvas',
    'generate_federated_sql',
    'propose_open_console',
    'get_access_policy',
    'set_access_policy',
    'get_call_history',
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
    const response = await fetch(`${BASE_URL}${path}`, {
        ...init,
        headers,
        signal: init?.signal ?? AbortSignal.timeout(30_000),
    })
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
        'describe_table',
        'Load DDL for a single table',
        {
            connectionId: z.string(),
            database: z.string(),
            tableName: z.string(),
        },
        async (args) => {
            const result = await apiFetch<unknown>('/api/platform/mcp/invoke', {
                method: 'POST',
                body: JSON.stringify({tool: 'describe_table', arguments: args}),
            })
            return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}]}
        },
    )

    server.tool(
        'get_schema_context',
        'Build schema context (tables, DDL snippets, relations, metrics) for AI prompts',
        {
            connectionId: z.string(),
            database: z.string(),
            prompt: z.string().optional(),
            tableNames: z.array(z.string()).optional(),
        },
        async (args) => {
            const result = await apiFetch<unknown>('/api/platform/mcp/invoke', {
                method: 'POST',
                body: JSON.stringify({tool: 'get_schema_context', arguments: args}),
            })
            return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}]}
        },
    )

    server.tool(
        'get_sample_data',
        'Fetch a small sample of table rows for LLM-visible enums/formats',
        {
            connectionId: z.string(),
            database: z.string(),
            tableName: z.string(),
            maxRows: z.number().optional(),
        },
        async (args) => {
            const result = await apiFetch<unknown>('/api/platform/mcp/invoke', {
                method: 'POST',
                body: JSON.stringify({tool: 'get_sample_data', arguments: args}),
            })
            return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}]}
        },
    )

    server.tool(
        'explain_query',
        'Run dialect EXPLAIN / query plan for a SQL statement',
        {
            connectionId: z.string(),
            database: z.string().optional(),
            sql: z.string(),
        },
        async (args) => {
            const result = await apiFetch<unknown>('/api/platform/mcp/invoke', {
                method: 'POST',
                body: JSON.stringify({tool: 'explain_query', arguments: args}),
            })
            return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}]}
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
        'validate_sql',
        'Validate SQL is read-only and check table/column names against schema',
        {
            sql: z.string(),
            connectionId: z.string(),
            database: z.string().optional(),
        },
        async (args) => {
            const result = await apiFetch<unknown>('/api/platform/mcp/invoke', {
                method: 'POST',
                body: JSON.stringify({tool: 'validate_sql', arguments: args}),
            })
            return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}]}
        },
    )

    server.tool(
        'list_relations',
        'List foreign-key relations among tables',
        {
            connectionId: z.string(),
            database: z.string(),
            tableNames: z.array(z.string()).optional(),
        },
        async (args) => {
            const result = await apiFetch<unknown>('/api/platform/mcp/invoke', {
                method: 'POST',
                body: JSON.stringify({tool: 'list_relations', arguments: args}),
            })
            return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}]}
        },
    )

    server.tool(
        'query_status',
        'Check whether a console queryId/sessionKey is still running',
        {
            queryId: z.string().optional(),
            sessionKey: z.string().optional(),
        },
        async (args) => {
            const result = await apiFetch<unknown>('/api/platform/mcp/invoke', {
                method: 'POST',
                body: JSON.stringify({tool: 'query_status', arguments: args}),
            })
            return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}]}
        },
    )

    server.tool(
        'cancel_query',
        'Cancel a running console query by queryId or sessionKey',
        {
            queryId: z.string().optional(),
            sessionKey: z.string().optional(),
            mode: z.enum(['query', 'connection']).optional(),
        },
        async (args) => {
            const result = await apiFetch<unknown>('/api/platform/mcp/invoke', {
                method: 'POST',
                body: JSON.stringify({tool: 'cancel_query', arguments: args}),
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

    server.tool(
        'get_access_policy',
        'Read the current tenant MCP access policy',
        {},
        async () => {
            const result = await apiFetch<unknown>('/api/platform/mcp/access-policy')
            return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}]}
        },
    )

    server.tool(
        'set_access_policy',
        'Update the tenant MCP access policy (dangerous)',
        {
            readOnly: z.boolean().optional(),
            allowDangerousSql: z.boolean().optional(),
            allowedToolNames: z.array(z.string()).optional(),
        },
        async (args) => {
            const result = await apiFetch<unknown>('/api/platform/mcp/invoke', {
                method: 'POST',
                body: JSON.stringify({tool: 'set_access_policy', arguments: args}),
            })
            return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}]}
        },
    )

    server.tool(
        'get_call_history',
        'List recent MCP invoke audit entries',
        {
            limit: z.number().optional(),
        },
        async (args) => {
            const params = new URLSearchParams()
            if (args.limit != null) params.set('limit', String(args.limit))
            const qs = params.toString()
            const result = await apiFetch<unknown>(`/api/platform/mcp/call-audit${qs ? `?${qs}` : ''}`)
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
