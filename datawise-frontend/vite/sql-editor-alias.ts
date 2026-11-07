import {existsSync} from 'node:fs'
import {join, resolve} from 'node:path'
import type {Plugin} from 'vite'

/** sql-editor 包根目录（与 datawise-frontend 同级） */
export const SQL_EDITOR_SRC = resolve(__dirname, '../../sql-editor/src')

/** 解析 @sql-editor/* 与 @datawise/sql-editor/* 到源码目录 */
export function sqlEditorAliasPlugin(): Plugin {
    return {
        name: 'sql-editor-alias',
        enforce: 'pre',
        resolveId(source) {
            if (source === '@datawise/sql-editor') {
                return join(SQL_EDITOR_SRC, 'index.ts')
            }
            if (source.startsWith('@datawise/sql-editor/')) {
                const sub = source.slice('@datawise/sql-editor/'.length)
                const target = join(SQL_EDITOR_SRC, sub)
                return existsSync(target) ? target : `${target}.ts`
            }
            if (source.startsWith('@sql-editor/')) {
                const sub = source.slice('@sql-editor/'.length)
                const target = join(SQL_EDITOR_SRC, sub)
                return existsSync(target) ? target : `${target}.ts`
            }
            return null
        },
    }
}
