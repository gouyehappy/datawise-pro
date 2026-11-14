/**
 * Dev launcher for the desktop UI.
 *
 * Default: same JVM as Spring Boot (JetBrains JCEF + jbr_jcef + spring-boot:run).
 * Legacy dual-process host: pass --dual (DatawiseDesktopApp spawns backend).
 */
import {spawn, spawnSync} from 'node:child_process'
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {ensureJbrJcef} from './ensure-jbr-jcef.mjs'
import {ensureJetbrainsJcefMavenArtifact} from '../../datawise-frontend/scripts/desktop/ensure-jcef-maven.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(desktopRoot, '..')
const backendRoot = path.join(repoRoot, 'datawise-backend')
const frontendRoot = path.join(repoRoot, 'datawise-frontend')
const configDir = path.join(repoRoot, 'config')
const isWin = process.platform === 'win32'

/** Prefer target/datawise-desktop-<pom.version>.jar; fall back to newest matching jar. */
function resolveDesktopJar(root = desktopRoot) {
  const targetDir = path.join(root, 'target')
  const version = readDesktopPomVersion(root)
  if (version) {
    const pinned = path.join(targetDir, `datawise-desktop-${version}.jar`)
    if (existsSync(pinned)) return pinned
  }
  if (!existsSync(targetDir)) return null
  const jars = readdirSync(targetDir)
    .filter((name) => /^datawise-desktop-.+\.jar$/i.test(name) && !name.endsWith('-sources.jar'))
    .map((name) => path.join(targetDir, name))
    .filter((p) => {
      try {
        return statSync(p).isFile()
      } catch {
        return false
      }
    })
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  return jars[0] ?? null
}

function readDesktopPomVersion(root = desktopRoot) {
  const pom = path.join(root, 'pom.xml')
  if (!existsSync(pom)) return null
  try {
    const text = readFileSync(pom, 'utf8')
    const match = text.match(/<artifactId>\s*datawise-desktop\s*<\/artifactId>[\s\S]*?<version>\s*([^<]+)\s*<\/version>/)
      || text.match(/<version>\s*([^<]+)\s*<\/version>/)
    return match?.[1]?.trim() || null
  } catch {
    return null
  }
}

function ensureSqlEditorDeps() {
  const script = path.join(frontendRoot, 'scripts', 'ensure-sql-editor-deps.mjs')
  if (!existsSync(script)) return
  const r = spawnSync(process.execPath, [script], {cwd: frontendRoot, stdio: 'inherit'})
  if (r.status !== 0) process.exit(r.status ?? 1)
}

function pathEnv(javaHome) {
  const key = isWin ? 'Path' : 'PATH'
  return {
    ...process.env,
    JAVA_HOME: javaHome,
    [key]: path.join(javaHome, 'bin') + path.delimiter + (process.env[key] || process.env.PATH || ''),
  }
}

async function resolveJbr() {
  console.log('[dev:jcef] ensuring jbr_jcef runtime…')
  const jbr = await ensureJbrJcef(path.join(desktopRoot, 'target', 'jbr-cache'))
  const javaBin = path.join(jbr.home, 'bin', isWin ? 'java.exe' : 'java')
  if (!existsSync(javaBin)) {
    throw new Error(`jbr_jcef java missing: ${javaBin}`)
  }
  console.log(`[dev:jcef] JAVA_HOME=${jbr.home}`)
  return {jbr, javaBin, env: pathEnv(jbr.home)}
}

function installDesktopModule(env) {
  console.log('[dev:jcef] installing JetBrains JCEF + datawise-desktop…')
  ensureJetbrainsJcefMavenArtifact()
  const r = spawnSync(isWin ? 'mvn.cmd' : 'mvn', ['-q', 'install', '-Dmaven.test.skip=true', '-DskipTests'], {
    cwd: desktopRoot,
    stdio: 'inherit',
    shell: isWin,
    env,
  })
  if (r.status !== 0) {
    process.exit(r.status ?? 1)
  }
}

function runDualProcess(javaBin, env, extraArgs) {
  console.log('[dev:jcef] packaging datawise-desktop (dual-process host)…')
  const mvn = spawnSync(isWin ? 'mvn.cmd' : 'mvn', ['-q', 'package', '-Dmaven.test.skip=true', '-DskipTests'], {
    cwd: desktopRoot,
    stdio: 'inherit',
    shell: isWin,
    env,
  })
  if (mvn.status !== 0) {
    process.exit(mvn.status ?? 1)
  }
  const jar = resolveDesktopJar(desktopRoot)
  if (!jar) {
    console.error('[dev:jcef] missing datawise-desktop-*.jar under target/ (run mvn package)')
    process.exit(1)
  }
  const cp = isWin
    ? `${jar};${path.join(desktopRoot, 'target', 'lib', '*')}`
    : `${jar}:${path.join(desktopRoot, 'target', 'lib', '*')}`
  console.log('[dev:jcef] starting DatawiseDesktopApp (dual-process)…')
  const child = spawn(
    javaBin,
    ['-Djava.awt.headless=false', '-cp', cp, 'org.apache.datawise.desktop.DatawiseDesktopApp', ...extraArgs],
    {cwd: desktopRoot, stdio: 'inherit', env, shell: false},
  )
  child.on('exit', (c) => process.exit(c ?? 0))
}

function runSameJvm(env, extraArgs) {
  installDesktopModule(env)
  // Windows+shell:true splits unquoted spaces and drops -Ddatawise.gui from the forked JVM.
  // Quote the whole jvmArguments value, and also set DATAWISE_GUI (inherited by the fork).
  const jvmArgs = [
    `-Ddatawise.config.dir=${configDir}`,
    `-Ddatawise.logging.dir=${path.join(configDir, 'logs')}`,
    '-Ddatawise.gui=true',
    '-Djava.awt.headless=false',
    '-Dsun.java2d.d3d=false',
  ].join(' ')
  const runEnv = {
    ...env,
    DATAWISE_GUI: 'true',
  }
  console.log('[dev:jcef] starting same-JVM Spring Boot + JCEF (spring-boot:run)…')
  const jvmArgFlag = isWin
    ? `-Dspring-boot.run.jvmArguments="${jvmArgs}"`
    : `-Dspring-boot.run.jvmArguments=${jvmArgs}`
  // Uses default Maven `target/` (same as desktop packaging / `npm run backend`).
  const args = [
    '-pl', 'datawise-server',
    '-am',
    'spring-boot:run',
    '-DskipTests',
    '-Dmaven.test.skip=true',
    '-Ddatawise.desktop.packaging=true',
    jvmArgFlag,
    ...extraArgs.filter((a) => a.startsWith('-D')),
  ]
  const child = spawn(isWin ? 'mvn.cmd' : 'mvn', args, {
    cwd: backendRoot,
    stdio: 'inherit',
    shell: isWin,
    env: runEnv,
    windowsHide: true,
  })
  child.on('exit', (c) => process.exit(c ?? 0))
}

async function main() {
  const argv = process.argv.slice(2)
  const dual = argv.includes('--dual')
  const extraArgs = argv.filter((a) => a !== '--dual')

  ensureSqlEditorDeps()
  const {javaBin, env} = await resolveJbr()
  if (dual) {
    installDesktopModule(env)
    runDualProcess(javaBin, env, extraArgs)
    return
  }
  runSameJvm(env, extraArgs)
}

main().catch((e) => {
  console.error('[dev:jcef]', e instanceof Error ? e.message : e)
  process.exit(1)
})
