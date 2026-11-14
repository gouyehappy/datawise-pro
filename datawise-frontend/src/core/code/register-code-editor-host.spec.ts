import {describe, expect, it} from 'vitest'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {dirname, join} from 'node:path'

describe('registerCodeEditorHost (PERF-03)', () => {
    it('does not sync-import monaco theme registration into the shell host', () => {
        const dir = dirname(fileURLToPath(import.meta.url))
        const source = readFileSync(join(dir, 'register-code-editor-host.ts'), 'utf8')
        expect(source).not.toMatch(/from ['"]@\/shared\/config\/monaco-editor-appearance['"]/)
        expect(source).not.toMatch(/from ['"]@\/shared\/config\/monaco-themes['"]/)
        expect(source).not.toMatch(/^\s*ensureMonacoThemes\(/m)
        expect(source).toMatch(/configureCodeEditorHost/)
    })
})
