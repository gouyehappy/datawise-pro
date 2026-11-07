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

export function resolveConfig(command: Command): CliConfig {
    const root = rootCommand(command)
    const opts = root.opts<{server?: string; token?: string}>()
    const server = (opts.server ?? process.env.DATAWISE_SERVER ?? DEFAULT_SERVER).replace(/\/+$/, '')
    const token = opts.token ?? process.env.DATAWISE_API_TOKEN ?? ''
    if (!token.trim()) {
        throw new Error('API token is required. Pass --token or set DATAWISE_API_TOKEN.')
    }
    return {server, token: token.trim()}
}
