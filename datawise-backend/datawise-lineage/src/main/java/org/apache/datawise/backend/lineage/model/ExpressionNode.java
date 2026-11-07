package org.apache.datawise.backend.lineage.model;

import java.util.List;

public sealed interface ExpressionNode permits
        ExpressionNode.ColumnRef,
        ExpressionNode.Function,
        ExpressionNode.Binary,
        ExpressionNode.Literal,
        ExpressionNode.CaseExpr,
        ExpressionNode.CastExpr,
        ExpressionNode.AllColumns {

    record ColumnRef(SourceRef ref) implements ExpressionNode {
    }

    record Function(String name, List<ExpressionNode> args) implements ExpressionNode {
    }

    record Binary(String operator, ExpressionNode left, ExpressionNode right) implements ExpressionNode {
    }

    record Literal(String value, String type) implements ExpressionNode {
    }

    record CaseExpr(List<WhenThen> whens, ExpressionNode elseExpr) implements ExpressionNode {
    }

    record CastExpr(ExpressionNode inner, String targetType) implements ExpressionNode {
    }

    record AllColumns(String tableQualifier) implements ExpressionNode {
    }

    record WhenThen(ExpressionNode condition, ExpressionNode result) {
    }
}
