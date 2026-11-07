package org.apache.datawise.sqlflow.analyzer;

import org.apache.datawise.sqlflow.metadata.MetadataService;
import org.apache.datawise.sqlflow.tree.expression.Expression;
import org.apache.datawise.sqlflow.tree.expression.FunctionCall;
import org.apache.datawise.sqlflow.tree.expression.GroupingOperation;

import com.google.common.collect.ImmutableList;
import com.google.common.collect.Iterables;

import java.util.List;

import static org.apache.datawise.sqlflow.analyzer.ExpressionTreeUtils.extractAggregateFunctions;
import static org.apache.datawise.sqlflow.analyzer.ExpressionTreeUtils.extractExpressions;
import static org.apache.datawise.sqlflow.analyzer.ExpressionTreeUtils.extractWindowExpressions;
import static org.apache.datawise.sqlflow.analyzer.SemanticExceptions.semanticException;

public class Analyzer
{

    static void verifyNoAggregateWindowOrGroupingFunctions(
            MetadataService metadataService,
            Expression predicate,
            String clause)
    {
        List<FunctionCall> aggregates = extractAggregateFunctions(ImmutableList.of(predicate), metadataService);

        List<Expression> windowExpressions = extractWindowExpressions(ImmutableList.of(predicate));

        List<GroupingOperation> groupingOperations = extractExpressions(
                ImmutableList.of(predicate),
                GroupingOperation.class);

        List<Expression> found = ImmutableList.copyOf(Iterables.concat(
                aggregates,
                windowExpressions,
                groupingOperations));

        if (!found.isEmpty()) {
            throw semanticException(
                    predicate,
                    "%s cannot contain aggregations, window functions or grouping operations: %s",
                    clause,
                    found);
        }
    }
}
