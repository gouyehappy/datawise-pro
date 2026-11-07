import * as monaco from 'monaco-editor'
import {sqlStatementFoldingRanges} from '@sql-editor/utils/sql-folding-ranges'

const PROVIDER_KEY = '__dwSqlFoldingRangeProviderDisposable__'

/** 按分号切分的语句级折叠（替换 Monaco 默认缩进折叠） */
export function registerSqlFoldingRangeProvider() {
    const globalRef = globalThis as typeof globalThis & {
        [PROVIDER_KEY]?: monaco.IDisposable
    }
    globalRef[PROVIDER_KEY]?.dispose()

    globalRef[PROVIDER_KEY] = monaco.languages.registerFoldingRangeProvider('sql', {
        provideFoldingRanges(model) {
            return sqlStatementFoldingRanges(model.getValue()).map((range) => ({
                start: range.start,
                end: range.end,
                kind: monaco.languages.FoldingRangeKind.Region,
            }))
        },
    })
}
