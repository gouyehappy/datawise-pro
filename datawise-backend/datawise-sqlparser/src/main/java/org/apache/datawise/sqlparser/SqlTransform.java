package org.apache.datawise.sqlparser;

import net.sf.jsqlparser.JSQLParserException;
import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.sqlparser.handle.LimitHandler;
import org.apache.datawise.sqlparser.handle.LimitOffsetHandler;
import org.apache.datawise.sqlparser.handle.OrderByHandler;
import org.apache.datawise.sqlparser.handle.WhereConditionHandler;

import java.util.ArrayList;
import java.util.List;

/**
 * Fluent, AST-based SQL rewriting facade. Parses the SQL once and applies each configured
 * transformation as a handler pass over the shared statement, so callers compose operations
 * without touching string concatenation:
 *
 * <pre>{@code
 * String sql = SqlTransform.of(userSql, "mysql")
 *         .appendWhere("status = 1")
 *         .orderByAsc("id")
 *         .limit(1000)
 *         .quoteIdentifiers()
 *         .toSql();
 * }</pre>
 *
 * <p>Row-level transforms ({@link #appendWhere}, {@link #orderByAsc}, {@link #limit}) only affect
 * the outermost query via {@link org.apache.datawise.sqlparser.handle.MainQueryHandler}.
 * New capabilities are added simply by writing another {@link Handler} — no changes here required
 * beyond an optional convenience method.
 */
public final class SqlTransform {

    private final SQLHandlerChainExecutor executor;
    private final DbType dbType;
    private final List<Handler<?>> pendingHandlers = new ArrayList<>();
    private boolean quoteIdentifiers;
    private boolean executed;

    private SqlTransform(SQLHandlerChainExecutor executor, DbType dbType) {
        this.executor = executor;
        this.dbType = dbType;
    }

    public static SqlTransform of(String sql, String dbTypeId) throws JSQLParserException {
        DbType dbType = DbType.find(DbType.normalizeId(dbTypeId)).orElse(DbType.MYSQL);
        return new SqlTransform(SQLHandlerChainExecutor.newInstance(sql), dbType);
    }

    public static SqlTransform of(String sql, DbType dbType) throws JSQLParserException {
        return new SqlTransform(SQLHandlerChainExecutor.newInstance(sql), dbType == null ? DbType.MYSQL : dbType);
    }

    /** AND-inject an additional predicate into the outer query's WHERE clause. */
    public SqlTransform appendWhere(String condition) throws JSQLParserException {
        return enqueue(new WhereConditionHandler(condition));
    }

    /** Append {@code ORDER BY col ASC, ...} when the outer query has no ORDER BY. */
    public SqlTransform orderByAsc(String... columns) throws JSQLParserException {
        return enqueue(new OrderByHandler(true, columns));
    }

    /** Append {@code ORDER BY col DESC, ...} when the outer query has no ORDER BY. */
    public SqlTransform orderByDesc(String... columns) throws JSQLParserException {
        return enqueue(new OrderByHandler(false, columns));
    }

    /** Cap the outer query at {@code maxRows}, lowering an existing larger LIMIT. */
    public SqlTransform limit(long maxRows) {
        return enqueue(new LimitHandler(maxRows));
    }

    /** Add {@code LIMIT maxRows} only when the query has none; leave any existing LIMIT as-is. */
    public SqlTransform limitIfAbsent(long maxRows) {
        return enqueue(new LimitHandler(maxRows, false));
    }

    /** Apply {@code LIMIT limit OFFSET offset} on the outer query, replacing any existing pagination. */
    public SqlTransform limitOffset(long limit, long offset) {
        return enqueue(new LimitOffsetHandler(limit, offset));
    }

    /** Quote reserved-word / mixed-case identifiers for the configured dialect. */
    public SqlTransform quoteIdentifiers() {
        quoteIdentifiers = true;
        return this;
    }

    /** Run arbitrary custom handlers in a single traversal pass. */
    public SqlTransform apply(Handler<?>... handlers) {
        if (handlers != null) {
            for (Handler<?> handler : handlers) {
                if (handler != null) {
                    pendingHandlers.add(handler);
                }
            }
        }
        return this;
    }

    public String toSql() {
        flush();
        return executor.getCurrentSql();
    }

    private SqlTransform enqueue(Handler<?> handler) {
        pendingHandlers.add(handler);
        return this;
    }

    private void flush() {
        if (executed) {
            return;
        }
        executed = true;
        if (!pendingHandlers.isEmpty()) {
            executor.executeHandlers(
                    new VisitorContext(dbType),
                    pendingHandlers.toArray(Handler<?>[]::new)
            );
        }
        if (quoteIdentifiers) {
            executor.executeQuoteHandlers(dbType);
        }
    }
}
