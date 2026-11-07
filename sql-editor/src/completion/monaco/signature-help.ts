import * as monaco from 'monaco-editor'
import {getActiveSqlEditorRuntime} from '@sql-editor/runtime/sql-editor-runtime'
import {setSqlCompletionDialect} from '../keyword-config'
import {listSqlDialectFunctionSignatures} from '../function-signatures'
import {
    findActiveFunctionCall,
    formatFunctionDisplaySignature,
    parseSignatureParams,
} from '../function-presentation'

const PROVIDER_KEY = '__dwSqlSignatureHelpProviderDisposable__'

/** 注册 SQL 函数 Signature Help（COUNT( | 时弹出参数提示） */
export function registerSqlSignatureHelpProvider() {
    const globalRef = globalThis as typeof globalThis & {
        [PROVIDER_KEY]?: monaco.IDisposable
    }
    globalRef[PROVIDER_KEY]?.dispose()

    globalRef[PROVIDER_KEY] = monaco.languages.registerSignatureHelpProvider('sql', {
        signatureHelpTriggerCharacters: ['(', ','],
        signatureHelpRetriggerCharacters: [','],
        provideSignatureHelp(model, position) {
            const runtime = getActiveSqlEditorRuntime()
            setSqlCompletionDialect(runtime.getDialect())

            const line = model.getLineContent(position.lineNumber)
            const before = line.slice(0, position.column - 1)
            // 跨行：取光标前最多 2k 字符，覆盖常见多行函数参数
            const offset = model.getOffsetAt(position)
            const full = model.getValue()
            const windowStart = Math.max(0, offset - 2000)
            const textBefore = full.slice(windowStart, offset) || before

            const active = findActiveFunctionCall(textBefore)
            if (!active) return null

            const fn = listSqlDialectFunctionSignatures().find(
                (item) => item.name.toLowerCase() === active.name.toLowerCase(),
            )
            if (!fn) return null

            const displaySig = formatFunctionDisplaySignature(fn.signature) ?? '()'
            const params = parseSignatureParams(fn.signature)
            const label = `${fn.name}${displaySig}`
            const documentation = fn.returns?.trim()
                ? {value: `Returns \`${fn.returns.trim()}\``}
                : undefined

            const signature: monaco.languages.SignatureInformation = {
                label,
                documentation,
                parameters: params.map((p) => ({label: p})),
            }

            const activeParameter = Math.min(
                Math.max(0, active.activeParameter),
                Math.max(0, params.length - 1),
            )

            return {
                value: {
                    signatures: [signature],
                    activeSignature: 0,
                    activeParameter,
                },
                dispose() {},
            }
        },
    })
}
