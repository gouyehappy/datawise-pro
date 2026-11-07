import {spawn} from 'node:child_process'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(__dirname, '..')

console.log('[dist:desktop] building JCEF desktop…')
const child = spawn(process.execPath, [path.join(desktopRoot, 'scripts', 'build-desktop.mjs'), ...process.argv.slice(2)], {
  cwd: desktopRoot,
  stdio: 'inherit',
})
child.on('exit', (code) => process.exit(code ?? 1))
