/**
 * Start Spring Boot against the isolated E2E config directory.
 * Prefers the packaged server JAR (fast); falls back to spring-boot:run.
 */
import {spawn} from 'node:child_process'
import {cpSync, existsSync, mkdirSync, readdirSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = join(frontendRoot, '..')
const backendRoot = join(repoRoot, 'datawise-backend')
const serverTarget = join(backendRoot, 'datawise-server', 'target')
const configDir = join(frontendRoot, '.e2e-backend-config')
const exampleUsers = join(repoRoot, 'config', 'users.json.example')
const ports = createRequire(import.meta.url)('../runtime-ports.json')

const EMPTY_CONNECTIONS = `<?xml version="1.0" encoding="UTF-8"?>
<datawise-connections version="1">
</datawise-connections>
`

mkdirSync(configDir, {recursive: true})
mkdirSync(join(configDir, 'plugins'), {recursive: true})
mkdirSync(join(configDir, 'drivers'), {recursive: true})
mkdirSync(join(configDir, 'tenants', 'default'), {recursive: true})
if (!existsSync(exampleUsers)) {
    console.error(`[e2e-backend] missing ${exampleUsers}`)
    process.exit(1)
}
cpSync(exampleUsers, join(configDir, 'users.json'))
// Prefer tenant-scoped layout so startup does not warn CONFIG_LEGACY_PATHS_PENDING.
writeFileSync(join(configDir, 'tenants', 'default', 'connections.xml'), EMPTY_CONNECTIONS, 'utf8')

const configDirArg = configDir.replaceAll('\\', '/')
const serverPort = String(ports.dev.backend)

function findServerJar() {
    if (!existsSync(serverTarget)) return null
    const jars = readdirSync(serverTarget)
        .filter((name) => /^datawise-server-.*\.jar$/.test(name) && !name.endsWith('.original'))
        .sort()
    return jars.length ? join(serverTarget, jars[jars.length - 1]) : null
}

function spawnInherit(command, args, cwd) {
    const child = spawn(command, args, {
        cwd,
        stdio: 'inherit',
        shell: process.platform === 'win32',
        windowsHide: true,
    })
    child.on('exit', (code, signal) => {
        if (signal) {
            process.kill(process.pid, signal)
            return
        }
        process.exit(code ?? 1)
    })
    for (const sig of ['SIGINT', 'SIGTERM']) {
        process.on(sig, () => {
            child.kill(sig)
        })
    }
    return child
}

console.log(`[e2e-backend] starting Spring Boot on :${serverPort}`)
console.log(`[e2e-backend] config: ${configDirArg}`)

const jar = findServerJar()
if (jar) {
    console.log(`[e2e-backend] using jar: ${jar}`)
    spawnInherit(
        'java',
        [
            `-Ddatawise.config.dir=${configDirArg}`,
            `-Ddatawise.logging.dir=${join(configDirArg, 'logs')}`,
            '-jar',
            jar,
            `--server.port=${serverPort}`,
            '--datawise.connectors.load-plugins=false',
            '--datawise.jdbc.preload-drivers-on-startup=false',
        ],
        backendRoot,
    )
} else {
    console.log('[e2e-backend] jar missing; falling back to mvn spring-boot:run')
    // No spaces inside -D values: Windows `shell: true` otherwise splits Maven properties.
    spawnInherit(
        'mvn',
        [
            '-pl',
            'datawise-server',
            '-am',
            'spring-boot:run',
            '-DskipTests',
            `-Dspring-boot.run.jvmArguments=-Ddatawise.config.dir=${configDirArg} -Ddatawise.logging.dir=${join(configDirArg, 'logs')}`,
            `-Dspring-boot.run.arguments=--server.port=${serverPort}`,
        ],
        backendRoot,
    )
}
