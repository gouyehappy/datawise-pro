#!/usr/bin/env node
/**
 * Build Jenkins Ops: Vue UI → ui/, Maven shade jar, unsigned .dwp.
 *
 *   node community-plugins/jenkins/package.mjs
 *   node community-plugins/jenkins/package.mjs --skip-frontend
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { packageJavaDwp } from '../scripts/package-java-dwp.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname)
const frontendDir = join(root, 'frontend')
const skipFrontend = process.argv.includes('--skip-frontend')

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

if (!skipFrontend) {
  console.log('→ Building Vue workbench (singlefile)…')
  if (!existsSync(join(frontendDir, 'node_modules'))) {
    run('npm', ['install'], frontendDir)
  }
  run('npm', ['run', 'build'], frontendDir)
}

await packageJavaDwp({
  rootDir: root,
  pluginId: 'io.datawise.community.jenkins',
  version: '0.3.27',
  jarName: 'jenkins-plugin.jar',
})
