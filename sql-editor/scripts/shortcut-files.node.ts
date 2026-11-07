import {readdirSync, readFileSync} from 'node:fs'
import {join, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

function loadTxtGlob(relativeDir: string): Record<string, string> {
    const dir = join(srcRoot, relativeDir)
    const out: Record<string, string> = {}
    for (const name of readdirSync(dir)) {
        if (!name.endsWith('.txt')) continue
        out[`../${relativeDir}/${name}`] = readFileSync(join(dir, name), 'utf8')
    }
    return out
}

export const shortcutFiles = loadTxtGlob('shortcuts-config')
