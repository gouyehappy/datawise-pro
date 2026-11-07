import {analyzeSqlCompletionContextUncached} from './context'

import type {SqlCompletionContext} from './context'


export type CompletionWorkerRequest = {

    id: number

    sql: string

    offset: number

    lineNumber: number

    column: number

    dialect: string

    tables: string[]

    columns: Record<string, { name: string }[]>

}


export type CompletionWorkerResponse = {

    id: number

    ctx: SqlCompletionContext

    parserKeywords: string[] | null

}


export type CompletionWorkerPreload = {

    type: 'preload'

    dialect: string

}


self.onmessage = async (
    event: MessageEvent<CompletionWorkerRequest | CompletionWorkerPreload>,
) => {

    const data = event.data

    if ('type' in data && data.type === 'preload') {
        return
    }


    const {id, sql, offset, tables, columns} = data as CompletionWorkerRequest

    const ctx = analyzeSqlCompletionContextUncached(sql, offset, tables, columns)

    const response: CompletionWorkerResponse = {id, ctx, parserKeywords: null}

    self.postMessage(response)

}
