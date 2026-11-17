import {readFileSync} from 'node:fs'
import type {Command} from 'commander'
import type {CliConfig} from './types.js'

const DEFAULT_SERVER = 'http://localhost:18421'

export function rootCommand(start: Command): Command {
    let current: Command = start
    while (current.parent) {
        current = current.parent
    }
    return current
}

function readTokenFile(path: string): string {
    try {
        return readFileSync(path, 'utf8').trim()
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to read token file ${path}: ${detail}`)
    }
}

/**
 * Prefer env / token file over `--token` so secrets are not visible in process listings.
 * Order: DATAWISE_TOKEN → DATAWISE_API_TOKEN → DATAWISE_TOKEN_FILE → --token-file → --token (warn).
 */
export function resolveApiToken(opts: {token?: string; tokenFile?: string}): string {
    const fromTokenEnv = process.env.DATAWISE_TOKEN?.trim()
    if (fromTokenEnv) return fromTokenEnv

    const fromLegacyEnv = process.env.DATAWISE_API_TOKEN?.trim()
    if (fromLegacyEnv) return fromLegacyEnv

    const envTokenFile = process.env.DATAWISE_TOKEN_FILE?.trim()
    if (envTokenFile) return readTokenFile(envTokenFile)

    const optTokenFile = opts.tokenFile?.trim()
    if (optTokenFile) return readTokenFile(optTokenFile)

    const fromCli = opts.token?.trim()
    if (fromCli) {
        console.warn(
            'Warning: --token exposes the secret in process listings; prefer DATAWISE_TOKEN or DATAWISE_TOKEN_FILE.',
        )
        return fromCli
    }

    throw new Error(
        'API token is required. Set DATAWISE_TOKEN (preferred), DATAWISE_API_TOKEN, DATAWISE_TOKEN_FILE, or pass --token-file / --token.',
    )
}

export function resolveConfig(command: Command): CliConfig {
    const root = rootCommand(command)
    const opts = root.opts<{server?: string; token?: string; tokenFile?: string}>()
    const server = (opts.server ?? process.env.DATAWISE_SERVER ?? DEFAULT_SERVER).replace(/\/+$/, '')
    const token = resolveApiToken(opts)
    return {server, token}
}
