#!/usr/bin/env node
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'
import {createDatawiseMcpServer} from './create-server.js'

async function main() {
    const server = createDatawiseMcpServer()
    const transport = new StdioServerTransport()
    await server.connect(transport)
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
