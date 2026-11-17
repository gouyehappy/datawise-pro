package org.apache.datawise.backend.jdbc.support;

import net.sf.jsqlparser.expression.AllValue;
import net.sf.jsqlparser.expression.AnalyticExpression;
import net.sf.jsqlparser.expression.AnyComparisonExpression;
import net.sf.jsqlparser.expression.ArrayConstructor;
import net.sf.jsqlparser.expression.ArrayExpression;
import net.sf.jsqlparser.expression.BooleanValue;
import net.sf.jsqlparser.expression.CaseExpression;
import net.sf.jsqlparser.expression.CastExpression;
import net.sf.jsqlparser.expression.CollateExpression;
import net.sf.jsqlparser.expression.ConnectByPriorOperator;
import net.sf.jsqlparser.expression.ConnectByRootOperator;
import net.sf.jsqlparser.expression.OverlapsCondition;
import net.sf.jsqlparser.expression.DateTimeLiteralExpression;
import net.sf.jsqlparser.expression.DateValue;
import net.sf.jsqlparser.expression.DoubleValue;
import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.expression.ExpressionVisitorAdapter;
import net.sf.jsqlparser.expression.ExtractExpression;
import net.sf.jsqlparser.expression.Function;
import net.sf.jsqlparser.expression.HexValue;
import net.sf.jsqlparser.expression.IntervalExpression;
import net.sf.jsqlparser.expression.JdbcNamedParameter;
import net.sf.jsqlparser.expression.JdbcParameter;
import net.sf.jsqlparser.expression.JsonExpression;
import net.sf.jsqlparser.expression.KeepExpression;
import net.sf.jsqlparser.expression.LongValue;
import net.sf.jsqlparser.expression.MySQLGroupConcat;
import net.sf.jsqlparser.expression.NextValExpression;
import net.sf.jsqlparser.expression.NotExpression;
import net.sf.jsqlparser.expression.NullValue;
import net.sf.jsqlparser.expression.NumericBind;
import net.sf.jsqlparser.expression.OracleHierarchicalExpression;
import net.sf.jsqlparser.expression.OracleHint;
import net.sf.jsqlparser.expression.RowConstructor;
import net.sf.jsqlparser.expression.RowGetExpression;
import net.sf.jsqlparser.expression.SignedExpression;
import net.sf.jsqlparser.expression.StringValue;
import net.sf.jsqlparser.expression.TimeKeyExpression;
import net.sf.jsqlparser.expression.TimeValue;
import net.sf.jsqlparser.expression.TimestampValue;
import net.sf.jsqlparser.expression.UserVariable;
import net.sf.jsqlparser.expression.VariableAssignment;
import net.sf.jsqlparser.expression.WhenClause;
import net.sf.jsqlparser.expression.XMLSerializeExpr;
import net.sf.jsqlparser.expression.operators.arithmetic.Addition;
import net.sf.jsqlparser.expression.operators.arithmetic.BitwiseAnd;
import net.sf.jsqlparser.expression.operators.arithmetic.BitwiseLeftShift;
import net.sf.jsqlparser.expression.operators.arithmetic.BitwiseOr;
import net.sf.jsqlparser.expression.operators.arithmetic.BitwiseRightShift;
import net.sf.jsqlparser.expression.operators.arithmetic.BitwiseXor;
import net.sf.jsqlparser.expression.operators.arithmetic.Concat;
import net.sf.jsqlparser.expression.operators.arithmetic.Division;
import net.sf.jsqlparser.expression.operators.arithmetic.IntegerDivision;
import net.sf.jsqlparser.expression.operators.arithmetic.Modulo;
import net.sf.jsqlparser.expression.operators.arithmetic.Multiplication;
import net.sf.jsqlparser.expression.operators.arithmetic.Subtraction;
import net.sf.jsqlparser.expression.operators.conditional.AndExpression;
import net.sf.jsqlparser.expression.operators.conditional.OrExpression;
import net.sf.jsqlparser.expression.operators.conditional.XorExpression;
import net.sf.jsqlparser.expression.operators.relational.Between;
import net.sf.jsqlparser.expression.operators.relational.ContainedBy;
import net.sf.jsqlparser.expression.operators.relational.Contains;
import net.sf.jsqlparser.expression.operators.relational.EqualsTo;
import net.sf.jsqlparser.expression.operators.relational.ExcludesExpression;
import net.sf.jsqlparser.expression.operators.relational.ExistsExpression;
import net.sf.jsqlparser.expression.operators.relational.ExpressionList;
import net.sf.jsqlparser.expression.operators.relational.FullTextSearch;
import net.sf.jsqlparser.expression.operators.relational.GreaterThan;
import net.sf.jsqlparser.expression.operators.relational.GreaterThanEquals;
import net.sf.jsqlparser.expression.operators.relational.InExpression;
import net.sf.jsqlparser.expression.operators.relational.IncludesExpression;
import net.sf.jsqlparser.expression.operators.relational.IsBooleanExpression;
import net.sf.jsqlparser.expression.operators.relational.IsDistinctExpression;
import net.sf.jsqlparser.expression.operators.relational.IsNullExpression;
import net.sf.jsqlparser.expression.operators.relational.IsUnknownExpression;
import net.sf.jsqlparser.expression.operators.relational.JsonOperator;
import net.sf.jsqlparser.expression.operators.relational.LikeExpression;
import net.sf.jsqlparser.expression.operators.relational.Matches;
import net.sf.jsqlparser.expression.operators.relational.MemberOfExpression;
import net.sf.jsqlparser.expression.operators.relational.MinorThan;
import net.sf.jsqlparser.expression.operators.relational.MinorThanEquals;
import net.sf.jsqlparser.expression.operators.relational.NotEqualsTo;
import net.sf.jsqlparser.expression.operators.relational.RegExpMatchOperator;
import net.sf.jsqlparser.expression.operators.relational.SimilarToExpression;
import net.sf.jsqlparser.schema.Column;
import net.sf.jsqlparser.statement.select.AllColumns;
import net.sf.jsqlparser.statement.select.AllTableColumns;
import net.sf.jsqlparser.statement.select.ParenthesedSelect;

/**
 * Whitelist walker for migration WHERE expressions. Allows comparison / boolean / arithmetic
 * trees over columns and literals; rejects subqueries, functions, and other high-risk nodes.
 */
final class MigrationWhereExpressionValidator extends ExpressionVisitorAdapter<Void> {

    static void validate(Expression expression) {
        if (expression == null) {
            throw new IllegalArgumentException("Unsafe WHERE clause");
        }
        expression.accept(new MigrationWhereExpressionValidator(), null);
    }

    private MigrationWhereExpressionValidator() {
    }

    private static Void reject(Expression expression) {
        throw new IllegalArgumentException(
                "Unsafe WHERE clause: disallowed expression " + expression.getClass().getSimpleName()
        );
    }

    @Override
    protected <S> Void visitExpression(Expression expression, S context) {
        return reject(expression);
    }

    // --- allowed leaves ---

    @Override
    public <S> Void visit(Column column, S context) {
        return null;
    }

    @Override
    public <S> Void visit(NullValue nullValue, S context) {
        return null;
    }

    @Override
    public <S> Void visit(LongValue longValue, S context) {
        return null;
    }

    @Override
    public <S> Void visit(DoubleValue doubleValue, S context) {
        return null;
    }

    @Override
    public <S> Void visit(StringValue stringValue, S context) {
        return null;
    }

    @Override
    public <S> Void visit(BooleanValue booleanValue, S context) {
        return null;
    }

    @Override
    public <S> Void visit(DateValue dateValue, S context) {
        return null;
    }

    @Override
    public <S> Void visit(TimeValue timeValue, S context) {
        return null;
    }

    @Override
    public <S> Void visit(TimestampValue timestampValue, S context) {
        return null;
    }

    @Override
    public <S> Void visit(HexValue hexValue, S context) {
        return null;
    }

    @Override
    public <S> Void visit(DateTimeLiteralExpression literal, S context) {
        return null;
    }

    @Override
    public <S> Void visit(TimeKeyExpression timeKeyExpression, S context) {
        return null;
    }

    // --- allowed operators (recurse via super) ---

    @Override
    public <S> Void visit(AndExpression andExpression, S context) {
        return super.visit(andExpression, context);
    }

    @Override
    public <S> Void visit(OrExpression orExpression, S context) {
        return super.visit(orExpression, context);
    }

    @Override
    public <S> Void visit(XorExpression xorExpression, S context) {
        return super.visit(xorExpression, context);
    }

    @Override
    public <S> Void visit(NotExpression notExpression, S context) {
        return super.visit(notExpression, context);
    }

    @Override
    public <S> Void visit(SignedExpression signedExpression, S context) {
        return super.visit(signedExpression, context);
    }

    @Override
    public <S> Void visit(EqualsTo equalsTo, S context) {
        return super.visit(equalsTo, context);
    }

    @Override
    public <S> Void visit(NotEqualsTo notEqualsTo, S context) {
        return super.visit(notEqualsTo, context);
    }

    @Override
    public <S> Void visit(GreaterThan greaterThan, S context) {
        return super.visit(greaterThan, context);
    }

    @Override
    public <S> Void visit(GreaterThanEquals greaterThanEquals, S context) {
        return super.visit(greaterThanEquals, context);
    }

    @Override
    public <S> Void visit(MinorThan minorThan, S context) {
        return super.visit(minorThan, context);
    }

    @Override
    public <S> Void visit(MinorThanEquals minorThanEquals, S context) {
        return super.visit(minorThanEquals, context);
    }

    @Override
    public <S> Void visit(Between between, S context) {
        return super.visit(between, context);
    }

    @Override
    public <S> Void visit(IsNullExpression isNullExpression, S context) {
        return super.visit(isNullExpression, context);
    }

    @Override
    public <S> Void visit(IsBooleanExpression isBooleanExpression, S context) {
        return super.visit(isBooleanExpression, context);
    }

    @Override
    public <S> Void visit(IsUnknownExpression isUnknownExpression, S context) {
        return super.visit(isUnknownExpression, context);
    }

    @Override
    public <S> Void visit(IsDistinctExpression isDistinctExpression, S context) {
        return super.visit(isDistinctExpression, context);
    }

    @Override
    public <S> Void visit(LikeExpression likeExpression, S context) {
        return super.visit(likeExpression, context);
    }

    @Override
    public <S> Void visit(SimilarToExpression similarToExpression, S context) {
        return super.visit(similarToExpression, context);
    }

    @Override
    public <S> Void visit(RegExpMatchOperator regExpMatchOperator, S context) {
        return super.visit(regExpMatchOperator, context);
    }

    @Override
    public <S> Void visit(InExpression inExpression, S context) {
        Expression right = inExpression.getRightExpression();
        if (right instanceof ParenthesedSelect) {
            return reject(right);
        }
        return super.visit(inExpression, context);
    }

    @Override
    public <S> Void visit(ExpressionList<? extends Expression> expressionList, S context) {
        return super.visit(expressionList, context);
    }

    @Override
    public <S> Void visit(Addition addition, S context) {
        return super.visit(addition, context);
    }

    @Override
    public <S> Void visit(Subtraction subtraction, S context) {
        return super.visit(subtraction, context);
    }

    @Override
    public <S> Void visit(Multiplication multiplication, S context) {
        return super.visit(multiplication, context);
    }

    @Override
    public <S> Void visit(Division division, S context) {
        return super.visit(division, context);
    }

    @Override
    public <S> Void visit(IntegerDivision integerDivision, S context) {
        return super.visit(integerDivision, context);
    }

    @Override
    public <S> Void visit(Modulo modulo, S context) {
        return super.visit(modulo, context);
    }

    @Override
    public <S> Void visit(Concat concat, S context) {
        return super.visit(concat, context);
    }

    @Override
    public <S> Void visit(BitwiseAnd bitwiseAnd, S context) {
        return super.visit(bitwiseAnd, context);
    }

    @Override
    public <S> Void visit(BitwiseOr bitwiseOr, S context) {
        return super.visit(bitwiseOr, context);
    }

    @Override
    public <S> Void visit(BitwiseXor bitwiseXor, S context) {
        return super.visit(bitwiseXor, context);
    }

    @Override
    public <S> Void visit(BitwiseLeftShift leftShift, S context) {
        return super.visit(leftShift, context);
    }

    @Override
    public <S> Void visit(BitwiseRightShift rightShift, S context) {
        return super.visit(rightShift, context);
    }

    // --- explicitly rejected ---

    @Override
    public <S> Void visit(Function function, S context) {
        return reject(function);
    }

    @Override
    public <S> Void visit(ParenthesedSelect parenthesedSelect, S context) {
        return reject(parenthesedSelect);
    }

    @Override
    public <S> Void visit(ExistsExpression existsExpression, S context) {
        return reject(existsExpression);
    }

    @Override
    public <S> Void visit(AnyComparisonExpression anyComparisonExpression, S context) {
        return reject(anyComparisonExpression);
    }

    @Override
    public <S> Void visit(AllValue allValue, S context) {
        return reject(allValue);
    }

    @Override
    public <S> Void visit(AnalyticExpression analyticExpression, S context) {
        return reject(analyticExpression);
    }

    @Override
    public <S> Void visit(CaseExpression caseExpression, S context) {
        return reject(caseExpression);
    }

    @Override
    public <S> Void visit(WhenClause whenClause, S context) {
        return reject(whenClause);
    }

    @Override
    public <S> Void visit(CastExpression castExpression, S context) {
        return reject(castExpression);
    }

    @Override
    public <S> Void visit(ExtractExpression extractExpression, S context) {
        return reject(extractExpression);
    }

    @Override
    public <S> Void visit(IntervalExpression intervalExpression, S context) {
        return reject(intervalExpression);
    }

    @Override
    public <S> Void visit(JsonExpression jsonExpression, S context) {
        return reject(jsonExpression);
    }

    @Override
    public <S> Void visit(JsonOperator jsonOperator, S context) {
        return reject(jsonOperator);
    }

    @Override
    public <S> Void visit(UserVariable userVariable, S context) {
        return reject(userVariable);
    }

    @Override
    public <S> Void visit(JdbcParameter jdbcParameter, S context) {
        return reject(jdbcParameter);
    }

    @Override
    public <S> Void visit(JdbcNamedParameter jdbcNamedParameter, S context) {
        return reject(jdbcNamedParameter);
    }

    @Override
    public <S> Void visit(NumericBind numericBind, S context) {
        return reject(numericBind);
    }

    @Override
    public <S> Void visit(KeepExpression keepExpression, S context) {
        return reject(keepExpression);
    }

    @Override
    public <S> Void visit(MySQLGroupConcat groupConcat, S context) {
        return reject(groupConcat);
    }

    @Override
    public <S> Void visit(RowConstructor<? extends Expression> rowConstructor, S context) {
        return reject(rowConstructor);
    }

    @Override
    public <S> Void visit(RowGetExpression rowGetExpression, S context) {
        return reject(rowGetExpression);
    }

    @Override
    public <S> Void visit(OracleHierarchicalExpression hierarchical, S context) {
        return reject(hierarchical);
    }

    @Override
    public <S> Void visit(OracleHint hint, S context) {
        return reject(hint);
    }

    @Override
    public <S> Void visit(ConnectByRootOperator connectByRootOperator, S context) {
        return reject(connectByRootOperator);
    }

    @Override
    public <S> Void visit(ConnectByPriorOperator connectByPriorOperator, S context) {
        return reject(connectByPriorOperator);
    }

    @Override
    public <S> Void visit(OverlapsCondition overlapsCondition, S context) {
        return reject(overlapsCondition);
    }

    @Override
    public <S> Void visit(NextValExpression nextValExpression, S context) {
        return reject(nextValExpression);
    }

    @Override
    public <S> Void visit(CollateExpression collateExpression, S context) {
        return reject(collateExpression);
    }

    @Override
    public <S> Void visit(ArrayExpression arrayExpression, S context) {
        return reject(arrayExpression);
    }

    @Override
    public <S> Void visit(ArrayConstructor arrayConstructor, S context) {
        return reject(arrayConstructor);
    }

    @Override
    public <S> Void visit(VariableAssignment variableAssignment, S context) {
        return reject(variableAssignment);
    }

    @Override
    public <S> Void visit(XMLSerializeExpr xmlSerializeExpr, S context) {
        return reject(xmlSerializeExpr);
    }

    @Override
    public <S> Void visit(FullTextSearch fullTextSearch, S context) {
        return reject(fullTextSearch);
    }

    @Override
    public <S> Void visit(MemberOfExpression memberOfExpression, S context) {
        return reject(memberOfExpression);
    }

    @Override
    public <S> Void visit(IncludesExpression includesExpression, S context) {
        return reject(includesExpression);
    }

    @Override
    public <S> Void visit(ExcludesExpression excludesExpression, S context) {
        return reject(excludesExpression);
    }

    @Override
    public <S> Void visit(Contains contains, S context) {
        return reject(contains);
    }

    @Override
    public <S> Void visit(ContainedBy containedBy, S context) {
        return reject(containedBy);
    }

    @Override
    public <S> Void visit(Matches matches, S context) {
        return reject(matches);
    }

    @Override
    public <S> Void visit(AllColumns allColumns, S context) {
        return reject(allColumns);
    }

    @Override
    public <S> Void visit(AllTableColumns allTableColumns, S context) {
        return reject(allTableColumns);
    }
}
