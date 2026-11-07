package org.apache.datawise.sqlflow;

import org.apache.datawise.sqlflow.tree.AllColumns;
import org.apache.datawise.sqlflow.tree.LikeClause;
import org.apache.datawise.sqlflow.tree.Node;
import org.apache.datawise.sqlflow.tree.OrderBy;
import org.apache.datawise.sqlflow.tree.PathElement;
import org.apache.datawise.sqlflow.tree.PathSpecification;
import org.apache.datawise.sqlflow.tree.ProcessingMode;
import org.apache.datawise.sqlflow.tree.Property;
import org.apache.datawise.sqlflow.tree.QueryPeriod;
import org.apache.datawise.sqlflow.tree.Select;
import org.apache.datawise.sqlflow.tree.SelectItem;
import org.apache.datawise.sqlflow.tree.SingleColumn;
import org.apache.datawise.sqlflow.tree.SortItem;
import org.apache.datawise.sqlflow.tree.TableElement;
import org.apache.datawise.sqlflow.tree.TableSubquery;
import org.apache.datawise.sqlflow.tree.UpdateAssignment;
import org.apache.datawise.sqlflow.tree.Values;
import org.apache.datawise.sqlflow.tree.With;
import org.apache.datawise.sqlflow.tree.WithQuery;
import org.apache.datawise.sqlflow.tree.expression.AllRows;
import org.apache.datawise.sqlflow.tree.expression.ArithmeticBinaryExpression;
import org.apache.datawise.sqlflow.tree.expression.ArithmeticUnaryExpression;
import org.apache.datawise.sqlflow.tree.expression.ArrayConstructor;
import org.apache.datawise.sqlflow.tree.expression.AtTimeZone;
import org.apache.datawise.sqlflow.tree.expression.BetweenPredicate;
import org.apache.datawise.sqlflow.tree.expression.BindExpression;
import org.apache.datawise.sqlflow.tree.expression.Cast;
import org.apache.datawise.sqlflow.tree.expression.CoalesceExpression;
import org.apache.datawise.sqlflow.tree.expression.ComparisonExpression;
import org.apache.datawise.sqlflow.tree.expression.CurrentCatalog;
import org.apache.datawise.sqlflow.tree.expression.CurrentPath;
import org.apache.datawise.sqlflow.tree.expression.CurrentSchema;
import org.apache.datawise.sqlflow.tree.expression.CurrentTime;
import org.apache.datawise.sqlflow.tree.expression.CurrentUser;
import org.apache.datawise.sqlflow.tree.expression.DereferenceExpression;
import org.apache.datawise.sqlflow.tree.expression.ExistsPredicate;
import org.apache.datawise.sqlflow.tree.expression.Expression;
import org.apache.datawise.sqlflow.tree.expression.Extract;
import org.apache.datawise.sqlflow.tree.expression.FieldReference;
import org.apache.datawise.sqlflow.tree.expression.Format;
import org.apache.datawise.sqlflow.tree.expression.FunctionCall;
import org.apache.datawise.sqlflow.tree.expression.GroupingOperation;
import org.apache.datawise.sqlflow.tree.expression.Identifier;
import org.apache.datawise.sqlflow.tree.expression.IfExpression;
import org.apache.datawise.sqlflow.tree.expression.InListExpression;
import org.apache.datawise.sqlflow.tree.expression.InPredicate;
import org.apache.datawise.sqlflow.tree.expression.IsNotNullPredicate;
import org.apache.datawise.sqlflow.tree.expression.IsNullPredicate;
import org.apache.datawise.sqlflow.tree.expression.LabelDereference;
import org.apache.datawise.sqlflow.tree.expression.LambdaArgumentDeclaration;
import org.apache.datawise.sqlflow.tree.expression.LambdaExpression;
import org.apache.datawise.sqlflow.tree.expression.LikePredicate;
import org.apache.datawise.sqlflow.tree.expression.LogicalExpression;
import org.apache.datawise.sqlflow.tree.expression.NotExpression;
import org.apache.datawise.sqlflow.tree.expression.NullIfExpression;
import org.apache.datawise.sqlflow.tree.expression.Parameter;
import org.apache.datawise.sqlflow.tree.expression.QuantifiedComparisonExpression;
import org.apache.datawise.sqlflow.tree.expression.Row;
import org.apache.datawise.sqlflow.tree.expression.SearchedCaseExpression;
import org.apache.datawise.sqlflow.tree.expression.SimpleCaseExpression;
import org.apache.datawise.sqlflow.tree.expression.SubqueryExpression;
import org.apache.datawise.sqlflow.tree.expression.SubscriptExpression;
import org.apache.datawise.sqlflow.tree.expression.SymbolReference;
import org.apache.datawise.sqlflow.tree.expression.TryExpression;
import org.apache.datawise.sqlflow.tree.expression.WhenClause;
import org.apache.datawise.sqlflow.tree.expression.WindowOperation;
import org.apache.datawise.sqlflow.tree.filter.FetchFirst;
import org.apache.datawise.sqlflow.tree.filter.Limit;
import org.apache.datawise.sqlflow.tree.filter.Offset;
import org.apache.datawise.sqlflow.tree.group.Cube;
import org.apache.datawise.sqlflow.tree.group.GroupBy;
import org.apache.datawise.sqlflow.tree.group.GroupingElement;
import org.apache.datawise.sqlflow.tree.group.GroupingSets;
import org.apache.datawise.sqlflow.tree.group.Rollup;
import org.apache.datawise.sqlflow.tree.group.SimpleGroupBy;
import org.apache.datawise.sqlflow.tree.join.Join;
import org.apache.datawise.sqlflow.tree.literal.BinaryLiteral;
import org.apache.datawise.sqlflow.tree.literal.BooleanLiteral;
import org.apache.datawise.sqlflow.tree.literal.CharLiteral;
import org.apache.datawise.sqlflow.tree.literal.DecimalLiteral;
import org.apache.datawise.sqlflow.tree.literal.DoubleLiteral;
import org.apache.datawise.sqlflow.tree.literal.GenericLiteral;
import org.apache.datawise.sqlflow.tree.literal.IntervalLiteral;
import org.apache.datawise.sqlflow.tree.literal.Literal;
import org.apache.datawise.sqlflow.tree.literal.LongLiteral;
import org.apache.datawise.sqlflow.tree.literal.NullLiteral;
import org.apache.datawise.sqlflow.tree.literal.StringLiteral;
import org.apache.datawise.sqlflow.tree.literal.TimeLiteral;
import org.apache.datawise.sqlflow.tree.literal.TimestampLiteral;
import org.apache.datawise.sqlflow.tree.merge.MergeCase;
import org.apache.datawise.sqlflow.tree.merge.MergeDelete;
import org.apache.datawise.sqlflow.tree.merge.MergeInsert;
import org.apache.datawise.sqlflow.tree.merge.MergeUpdate;
import org.apache.datawise.sqlflow.tree.relation.AliasedRelation;
import org.apache.datawise.sqlflow.tree.relation.Except;
import org.apache.datawise.sqlflow.tree.relation.Intersect;
import org.apache.datawise.sqlflow.tree.relation.Lateral;
import org.apache.datawise.sqlflow.tree.relation.QueryBody;
import org.apache.datawise.sqlflow.tree.relation.QuerySpecification;
import org.apache.datawise.sqlflow.tree.relation.Relation;
import org.apache.datawise.sqlflow.tree.relation.SampledRelation;
import org.apache.datawise.sqlflow.tree.relation.SetOperation;
import org.apache.datawise.sqlflow.tree.relation.Table;
import org.apache.datawise.sqlflow.tree.relation.Union;
import org.apache.datawise.sqlflow.tree.relation.Unnest;
import org.apache.datawise.sqlflow.tree.statement.CreateMaterializedView;
import org.apache.datawise.sqlflow.tree.statement.CreateTableAsSelect;
import org.apache.datawise.sqlflow.tree.statement.CreateView;
import org.apache.datawise.sqlflow.tree.statement.Delete;
import org.apache.datawise.sqlflow.tree.statement.Insert;
import org.apache.datawise.sqlflow.tree.statement.Merge;
import org.apache.datawise.sqlflow.tree.statement.Query;
import org.apache.datawise.sqlflow.tree.statement.Statement;
import org.apache.datawise.sqlflow.tree.statement.Update;
import org.apache.datawise.sqlflow.tree.type.DataType;
import org.apache.datawise.sqlflow.tree.type.DataTypeParameter;
import org.apache.datawise.sqlflow.tree.type.DateTimeDataType;
import org.apache.datawise.sqlflow.tree.type.GenericDataType;
import org.apache.datawise.sqlflow.tree.type.IntervalDayTimeDataType;
import org.apache.datawise.sqlflow.tree.type.NumericParameter;
import org.apache.datawise.sqlflow.tree.type.RowDataType;
import org.apache.datawise.sqlflow.tree.type.TypeParameter;
import org.apache.datawise.sqlflow.tree.window.FrameBound;
import org.apache.datawise.sqlflow.tree.window.MeasureDefinition;
import org.apache.datawise.sqlflow.tree.window.SkipTo;
import org.apache.datawise.sqlflow.tree.window.SubsetDefinition;
import org.apache.datawise.sqlflow.tree.window.VariableDefinition;
import org.apache.datawise.sqlflow.tree.window.WindowDefinition;
import org.apache.datawise.sqlflow.tree.window.WindowFrame;
import org.apache.datawise.sqlflow.tree.window.WindowReference;
import org.apache.datawise.sqlflow.tree.window.WindowSpecification;
import org.apache.datawise.sqlflow.tree.window.rowPattern.AnchorPattern;
import org.apache.datawise.sqlflow.tree.window.rowPattern.EmptyPattern;
import org.apache.datawise.sqlflow.tree.window.rowPattern.ExcludedPattern;
import org.apache.datawise.sqlflow.tree.window.rowPattern.OneOrMoreQuantifier;
import org.apache.datawise.sqlflow.tree.window.rowPattern.PatternAlternation;
import org.apache.datawise.sqlflow.tree.window.rowPattern.PatternConcatenation;
import org.apache.datawise.sqlflow.tree.window.rowPattern.PatternPermutation;
import org.apache.datawise.sqlflow.tree.window.rowPattern.PatternQuantifier;
import org.apache.datawise.sqlflow.tree.window.rowPattern.PatternRecognitionRelation;
import org.apache.datawise.sqlflow.tree.window.rowPattern.PatternSearchMode;
import org.apache.datawise.sqlflow.tree.window.rowPattern.PatternVariable;
import org.apache.datawise.sqlflow.tree.window.rowPattern.QuantifiedPattern;
import org.apache.datawise.sqlflow.tree.window.rowPattern.RangeQuantifier;
import org.apache.datawise.sqlflow.tree.window.rowPattern.RowPattern;
import org.apache.datawise.sqlflow.tree.window.rowPattern.ZeroOrMoreQuantifier;
import org.apache.datawise.sqlflow.tree.window.rowPattern.ZeroOrOneQuantifier;

import javax.annotation.Nullable;

/**
 * huaixin 2021/12/18 9:53 PM
 */
public abstract class AstVisitor<R, C>
{
    public R process(Node node)
    {
        return process(node, null);
    }

    public R process(Node node, @Nullable C context)
    {
        return node.accept(this, context);
    }

    public R visitNode(Node node, C context)
    {
        return null;
    }

    public R visitExpression(Expression node, C context)
    {
        return visitNode(node, context);
    }

    public R visitDereferenceExpression(DereferenceExpression node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitStatement(Statement node, C context)
    {
        return visitNode(node, context);
    }

    public R visitCreateTableAsSelect(CreateTableAsSelect node, C context)
    {
        return visitStatement(node, context);
    }

    public R visitCreateView(CreateView node, C context)
    {
        return visitStatement(node, context);
    }

    public R visitCreateMaterializedView(CreateMaterializedView node, C context)
    {
        return visitStatement(node, context);
    }

    public R visitDelete(Delete node, C context)
    {
        return visitStatement(node, context);
    }

    public R visitUpdate(Update node, C context)
    {
        return visitStatement(node, context);
    }

    public R visitUpdateAssignment(UpdateAssignment node, C context)
    {
        return visitNode(node, context);
    }

    public R visitMerge(Merge node, C context)
    {
        return visitStatement(node, context);
    }

    public R visitMergeCase(MergeCase node, C context)
    {
        return visitNode(node, context);
    }

    public R visitMergeInsert(MergeInsert node, C context)
    {
        return visitMergeCase(node, context);
    }

    public R visitMergeUpdate(MergeUpdate node, C context)
    {
        return visitMergeCase(node, context);
    }

    public R visitMergeDelete(MergeDelete node, C context)
    {
        return visitMergeCase(node, context);
    }

    public R visitTableElement(TableElement node, C context)
    {
        return visitNode(node, context);
    }

    public R visitLikeClause(LikeClause node, C context)
    {
        return visitTableElement(node, context);
    }

    public R visitProperty(Property node, C context)
    {
        return visitNode(node, context);
    }

    public R visitQuery(Query node, C context)
    {
        return visitStatement(node, context);
    }

    public R visitRelation(Relation node, C context)
    {
        return visitNode(node, context);
    }

    public R visitQueryBody(QueryBody node, C context)
    {
        return visitRelation(node, context);
    }

    public R visitOrderBy(OrderBy node, C context)
    {
        return visitNode(node, context);
    }

    public R visitOffset(Offset node, C context)
    {
        return visitNode(node, context);
    }

    public R visitFetchFirst(FetchFirst node, C context)
    {
        return visitNode(node, context);
    }

    public R visitLimit(Limit node, C context)
    {
        return visitNode(node, context);
    }

    public R visitNullIfExpression(NullIfExpression node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitIfExpression(IfExpression node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitArithmeticUnary(ArithmeticUnaryExpression node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitArithmeticBinary(ArithmeticBinaryExpression node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitBetweenPredicate(BetweenPredicate node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitCoalesceExpression(CoalesceExpression node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitLikePredicate(LikePredicate node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitIsNotNullPredicate(IsNotNullPredicate node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitIsNullPredicate(IsNullPredicate node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitComparisonExpression(ComparisonExpression node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitNotExpression(NotExpression node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitInListExpression(InListExpression node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitAllRows(AllRows node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitWith(With node, C context)
    {
        return visitNode(node, context);
    }

    public R visitWithQuery(WithQuery node, C context)
    {
        return visitNode(node, context);
    }

    public R visitSelect(Select node, C context)
    {
        return visitNode(node, context);
    }

    public R visitRow(Row node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitTableSubquery(TableSubquery node, C context)
    {
        return visitQueryBody(node, context);
    }

    public R visitAliasedRelation(AliasedRelation node, C context)
    {
        return visitRelation(node, context);
    }

    public R visitSampledRelation(SampledRelation node, C context)
    {
        return visitRelation(node, context);
    }

    public R visitTable(Table node, C context)
    {
        return visitQueryBody(node, context);
    }

    public R visitUnnest(Unnest node, C context)
    {
        return visitRelation(node, context);
    }

    public R visitLateral(Lateral node, C context)
    {
        return visitRelation(node, context);
    }

    public R visitValues(Values node, C context)
    {
        return visitQueryBody(node, context);
    }

    public R visitJoin(Join node, C context)
    {
        return visitRelation(node, context);
    }

    public R visitExists(ExistsPredicate node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitTryExpression(TryExpression node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitCast(Cast node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitFieldReference(FieldReference node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitQuerySpecification(QuerySpecification node, C context)
    {
        return visitQueryBody(node, context);
    }

    public R visitSortItem(SortItem node, C context)
    {
        return visitNode(node, context);
    }

    public R visitIdentifier(Identifier node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitInsert(Insert node, C context)
    {
        return visitStatement(node, context);
    }

    public R visitSelectItem(SelectItem node, C context)
    {
        return visitNode(node, context);
    }

    public R visitSingleColumn(SingleColumn node, C context)
    {
        return visitSelectItem(node, context);
    }

    public R visitAllColumns(AllColumns node, C context)
    {
        return visitSelectItem(node, context);
    }

    public R visitAtTimeZone(AtTimeZone node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitGroupBy(GroupBy node, C context)
    {
        return visitNode(node, context);
    }

    public R visitGroupingElement(GroupingElement node, C context)
    {
        return visitNode(node, context);
    }

    public R visitCube(Cube node, C context)
    {
        return visitGroupingElement(node, context);
    }

    public R visitGroupingSets(GroupingSets node, C context)
    {
        return visitGroupingElement(node, context);
    }

    public R visitRollup(Rollup node, C context)
    {
        return visitGroupingElement(node, context);
    }

    public R visitSimpleGroupBy(SimpleGroupBy node, C context)
    {
        return visitGroupingElement(node, context);
    }

    public R visitQuantifiedComparisonExpression(QuantifiedComparisonExpression node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitLambdaArgumentDeclaration(LambdaArgumentDeclaration node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitBindExpression(BindExpression node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitGroupingOperation(GroupingOperation node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitCurrentCatalog(CurrentCatalog node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitCurrentSchema(CurrentSchema node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitCurrentUser(CurrentUser node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitCurrentTime(CurrentTime node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitExtract(Extract node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitCurrentPath(CurrentPath node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitFormat(Format node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitDataType(DataType node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitRowDataType(RowDataType node, C context)
    {
        return visitDataType(node, context);
    }

    public R visitGenericDataType(GenericDataType node, C context)
    {
        return visitDataType(node, context);
    }

    public R visitRowField(RowDataType.Field node, C context)
    {
        return visitNode(node, context);
    }

    public R visitDataTypeParameter(DataTypeParameter node, C context)
    {
        return visitNode(node, context);
    }

    public R visitNumericTypeParameter(NumericParameter node, C context)
    {
        return visitDataTypeParameter(node, context);
    }

    public R visitTypeParameter(TypeParameter node, C context)
    {
        return visitDataTypeParameter(node, context);
    }

    public R visitIntervalDataType(IntervalDayTimeDataType node, C context)
    {
        return visitDataType(node, context);
    }

    public R visitDateTimeType(DateTimeDataType node, C context)
    {
        return visitDataType(node, context);
    }

    public R visitArrayConstructor(ArrayConstructor node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitSubscriptExpression(SubscriptExpression node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitLogicalExpression(LogicalExpression node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitSubqueryExpression(SubqueryExpression node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitInPredicate(InPredicate node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitSearchedCaseExpression(SearchedCaseExpression node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitFunctionCall(FunctionCall node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitProcessingMode(ProcessingMode node, C context)
    {
        return visitNode(node, context);
    }

    public R visitWindowOperation(WindowOperation node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitLambdaExpression(LambdaExpression node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitSimpleCaseExpression(SimpleCaseExpression node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitWhenClause(WhenClause node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitLiteral(Literal node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitDoubleLiteral(DoubleLiteral node, C context)
    {
        return visitLiteral(node, context);
    }

    public R visitDecimalLiteral(DecimalLiteral node, C context)
    {
        return visitLiteral(node, context);
    }

    public R visitGenericLiteral(GenericLiteral node, C context)
    {
        return visitLiteral(node, context);
    }

    public R visitTimeLiteral(TimeLiteral node, C context)
    {
        return visitLiteral(node, context);
    }

    public R visitTimestampLiteral(TimestampLiteral node, C context)
    {
        return visitLiteral(node, context);
    }

    public R visitIntervalLiteral(IntervalLiteral node, C context)
    {
        return visitLiteral(node, context);
    }

    public R visitStringLiteral(StringLiteral node, C context)
    {
        return visitLiteral(node, context);
    }

    public R visitCharLiteral(CharLiteral node, C context)
    {
        return visitLiteral(node, context);
    }

    public R visitBinaryLiteral(BinaryLiteral node, C context)
    {
        return visitLiteral(node, context);
    }

    public R visitBooleanLiteral(BooleanLiteral node, C context)
    {
        return visitLiteral(node, context);
    }

    public R visitNullLiteral(NullLiteral node, C context)
    {
        return visitLiteral(node, context);
    }

    public R visitLongLiteral(LongLiteral node, C context)
    {
        return visitLiteral(node, context);
    }

    public R visitParameter(Parameter node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitWindowReference(WindowReference node, C context)
    {
        return visitNode(node, context);
    }

    public R visitWindowSpecification(WindowSpecification node, C context)
    {
        return visitNode(node, context);
    }

    public R visitWindowDefinition(WindowDefinition node, C context)
    {
        return visitNode(node, context);
    }

    public R visitWindowFrame(WindowFrame node, C context)
    {
        return visitNode(node, context);
    }

    public R visitFrameBound(FrameBound node, C context)
    {
        return visitNode(node, context);
    }

    public R visitMeasureDefinition(MeasureDefinition node, C context)
    {
        return visitNode(node, context);
    }

    public R visitSkipTo(SkipTo node, C context)
    {
        return visitNode(node, context);
    }

    public R visitPatternSearchMode(PatternSearchMode node, C context)
    {
        return visitNode(node, context);
    }

    public R visitSubsetDefinition(SubsetDefinition node, C context)
    {
        return visitNode(node, context);
    }

    public R visitVariableDefinition(VariableDefinition node, C context)
    {
        return visitNode(node, context);
    }

    public R visitPatternRecognitionRelation(PatternRecognitionRelation node, C context)
    {
        return visitRelation(node, context);
    }

    public R visitRowPattern(RowPattern node, C context)
    {
        return visitNode(node, context);
    }

    public R visitPatternAlternation(PatternAlternation node, C context)
    {
        return visitRowPattern(node, context);
    }

    public R visitPatternConcatenation(PatternConcatenation node, C context)
    {
        return visitRowPattern(node, context);
    }

    public R visitQuantifiedPattern(QuantifiedPattern node, C context)
    {
        return visitRowPattern(node, context);
    }

    public R visitAnchorPattern(AnchorPattern node, C context)
    {
        return visitRowPattern(node, context);
    }

    public R visitEmptyPattern(EmptyPattern node, C context)
    {
        return visitRowPattern(node, context);
    }

    public R visitExcludedPattern(ExcludedPattern node, C context)
    {
        return visitRowPattern(node, context);
    }

    public R visitPatternPermutation(PatternPermutation node, C context)
    {
        return visitRowPattern(node, context);
    }

    public R visitPatternVariable(PatternVariable node, C context)
    {
        return visitRowPattern(node, context);
    }

    public R visitPatternQuantifier(PatternQuantifier node, C context)
    {
        return visitNode(node, context);
    }

    public R visitZeroOrMoreQuantifier(ZeroOrMoreQuantifier node, C context)
    {
        return visitPatternQuantifier(node, context);
    }

    public R visitOneOrMoreQuantifier(OneOrMoreQuantifier node, C context)
    {
        return visitPatternQuantifier(node, context);
    }

    public R visitZeroOrOneQuantifier(ZeroOrOneQuantifier node, C context)
    {
        return visitPatternQuantifier(node, context);
    }

    public R visitRangeQuantifier(RangeQuantifier node, C context)
    {
        return visitPatternQuantifier(node, context);
    }

    public R visitQueryPeriod(QueryPeriod node, C context)
    {
        return visitNode(node, context);
    }

    public R visitSymbolReference(SymbolReference node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitLabelDereference(LabelDereference node, C context)
    {
        return visitExpression(node, context);
    }

    public R visitSetOperation(SetOperation node, C context)
    {
        return visitQueryBody(node, context);
    }

    public R visitUnion(Union node, C context)
    {
        return visitSetOperation(node, context);
    }

    public R visitIntersect(Intersect node, C context)
    {
        return visitSetOperation(node, context);
    }

    public R visitExcept(Except node, C context)
    {
        return visitSetOperation(node, context);
    }

    public R visitPathSpecification(PathSpecification node, C context)
    {
        return visitNode(node, context);
    }

    public R visitPathElement(PathElement node, C context)
    {
        return visitNode(node, context);
    }
}
