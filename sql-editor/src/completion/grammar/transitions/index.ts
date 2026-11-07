export {
    detectAfterCompleteOnPredicate,
    detectAfterCompleteWherePredicate,
    segmentEndsWithOperator,
    segmentHasIncompletePredicateRhs,
    onClauseHasComparisonOperator,
    completionSegmentAtOffset,
} from './predicate'

export {detectAfterCompleteGroupByList} from './clause'

export {detectAfterSelectAggregateKeyword} from './select-list'

export {detectDdlAwaitingColumnType, detectDdlAfterAlterTable} from './ddl'

export {
    detectInsertInColumnList,
    detectAfterInsertColumnList,
    detectAfterCompleteSetAssignment,
} from './dml'
