#!/usr/bin/env node
/**
 * Community plugin smoke: package hello → install/uninstall (signed) unit path.
 *
 *   node scripts/smoke-community-plugin.mjs
 */
import {spawnSync} from 'node:child_process'
import {existsSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const backend = join(root, 'datawise-backend')
const packageScript = join(root, 'community-plugins/examples/hello-workbench/package.mjs')
const isWin = process.platform === 'win32'

function run(cmd, args, cwd) {
  console.log(`\n→ ${cmd} ${args.join(' ')}`)
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: isWin,
    env: process.env,
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

if (!existsSync(packageScript)) {
  console.error('Missing', packageScript)
  process.exit(1)
}

run(process.execPath, [packageScript], root)
run('mvn', [
  '-pl', 'datawise-common,datawise-server',
  '-am',
  'test',
  '-Dtest=CommunityPluginCompatibilityGateTest,DwpCodecTest,CommunityPluginInstallerTest,CommunityPluginSignedInstallTest,CommunityPluginReferenceGuardTest,CommunityPluginPackageFetcherTest,CommunityPluginMarketplaceInstallTest,CommunityPluginMarketplaceMergeTest,CommunityPluginHostConnectionTest,PackagedHelloDwpInstallTest',
  '-Dsurefire.failIfNoSpecifiedTests=false',
  '-q',
], backend)

console.log('\n✓ Community plugin smoke passed (package + codec/install/signed/uninstall tests)')
