import * as monaco from 'monaco-editor'
import {getActiveSqlEditorRuntime} from '@sql-editor/runtime/sql-editor-runtime'
import {shouldAbortCompletion} from '../policy/guards'
import {setSqlCompletionDialect} from '../keyword-config'
import {effectiveCompletionInput} from '../range'
import {buildMonacoSuggestions} from '../builders/engine'
import {
    getCompletionSnapshot,
    preloadCompletionWorker,
} from '../completion-worker-client'
import {isAutocompleteSuppressed} from '../suppress-autocomplete'
import {bypassesAutocompleteSuppress, lineBeforeIsColumnRef} from '../trigger-policy'

const PROVIDER_KEY = '__dwSqlCompletionProviderDisposable__'

/** 注册 SQL 上下文感知补全 */
export function registerSqlCompletionProvider() {
    const globalRef = globalThis as typeof globalThis & {
        [PROVIDER_KEY]?: monaco.IDisposable
    }
    globalRef[PROVIDER_KEY]?.dispose()

    globalRef[PROVIDER_KEY] = monaco.languages.registerCompletionItemProvider('sql', {
        triggerCharacters: [' ', '.', ',', '(', '=', '*'],
        async provideCompletionItems(model, position, context) {
            const lineBefore = model.getLineContent(position.lineNumber).slice(0, position.column - 1)
            const forceColumnRef = lineBeforeIsColumnRef(lineBefore)
            if (
                isAutocompleteSuppressed() &&
                !bypassesAutocompleteSuppress(context.triggerCharacter) &&
                !forceColumnRef
            ) {
                return undefined
            }

            const runtime = getActiveSqlEditorRuntime()
            const dialect = runtime.getDialect()
            setSqlCompletionDialect(dialect)
            preloadCompletionWorker(dialect)

            const sql = model.getValue()
            const offset = model.getOffsetAt(position)
            const schema = runtime.getSchema()

            const snapshot = await getCompletionSnapshot(
                sql,
                offset,
                dialect ?? 'mysql',
                schema.tables,
                schema.columns,
            ).catch((err: unknown) => {
                if (err instanceof DOMException && err.name === 'AbortError') return null
                throw err
            })
            if (!snapshot) return undefined

            const {prefix} = effectiveCompletionInput(model, position, snapshot.context)

            if (
                shouldAbortCompletion({
                    sql,
                    offset,
                    prefix,
                    ctx: snapshot.context,
                    triggerKind: context.triggerKind,
                })
            ) {
                return undefined
            }

            const suggestions = buildMonacoSuggestions({snapshot, model, position, schema})
            if (!suggestions.length) return undefined
            return {suggestions}
        },
    })
}
