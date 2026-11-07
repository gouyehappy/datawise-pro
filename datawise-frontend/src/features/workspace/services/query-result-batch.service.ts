import {t} from '@/i18n'
import type {QueryResultItem} from '@/features/workspace/types'
import {
    appendStreamingBatchSummary,
    buildCollapsedBatchSummary,
    createStreamingBatchSummary,
    finishStreamingBatchSummary,
    shouldCollapseBatchResults,
} from '@/features/workspace/services/query-result-batch.utils'

function batchOverviewLabel() {
    return t('queryResult.batchTab')
}

function batchLabels() {
    const overviewLabel = batchOverviewLabel()
    return {
        summaryLabel: overviewLabel,
        resultTabLabel: (index: number, item: QueryResultItem) =>
            item.label || t('queryResult.resultTab', {n: index + 1}),
        runningLabel: () => overviewLabel,
    }
}

export {
    buildCollapsedBatchSummary,
    buildStreamingProgressSnapshot,
    isNonGridResult,
    shouldCollapseBatchResults,
} from '@/features/workspace/services/query-result-batch.utils'
export type {BatchSummaryLabels} from '@/features/workspace/services/query-result-batch.utils'

export function collapseBatchResultsToSummary(items: QueryResultItem[]): QueryResultItem[] {
    if (!shouldCollapseBatchResults(items)) return items

    return buildCollapsedBatchSummary(items, batchLabels())
}

export function createStreamingBatchSummaryItem(
    totalStatements: number,
    batchId: string,
): QueryResultItem {
    return createStreamingBatchSummary(totalStatements, batchId, batchLabels())
}

export function appendStreamingBatchSummaryItem(
    summary: QueryResultItem,
    item: QueryResultItem,
    index: number,
): QueryResultItem {
    return appendStreamingBatchSummary(summary, item, index, batchLabels())
}

export function finishStreamingBatchSummaryItem(summary: QueryResultItem): QueryResultItem {
    return finishStreamingBatchSummary(summary, batchOverviewLabel())
}
