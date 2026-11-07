package org.apache.datawise.sqlparser;

import net.sf.jsqlparser.JSQLParserException;
import net.sf.jsqlparser.parser.CCJSqlParserUtil;
import net.sf.jsqlparser.statement.Statement;
import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.sqlparser.support.IdentifierQuoteSupport;
import org.apache.datawise.sqlparser.visitors.CommonStatementVisitor;

import java.util.Arrays;
import java.util.Objects;

/**
 * SQL handler chain executor (ported from datawise-components sqlparser).
 * Parses SQL once, runs handlers via visitor chain, then renders via {@link Statement#toString()}.
 */
public final class SQLHandlerChainExecutor {

    private final Statement statement;
    private final String sourceSql;

    private SQLHandlerChainExecutor(Statement statement, String sourceSql) {
        this.statement = statement;
        this.sourceSql = sourceSql;
    }

    public static SQLHandlerChainExecutor newInstance(String sql) throws JSQLParserException {
        Statement statement = CCJSqlParserUtil.parse(sql);
        return new SQLHandlerChainExecutor(statement, sql);
    }

    public SQLHandlerChainExecutor executeQuoteHandlers(DbType dbType) {
        return runVisitorChain(IdentifierQuoteSupport.defaultQuoteContext(dbType));
    }

    public SQLHandlerChainExecutor executeHandlers(VisitorContext context, Handler<?>... handlers) {
        if (handlers == null || handlers.length == 0) {
            return this;
        }
        VisitorContext visitorContext = context == null ? new VisitorContext() : context;
        registerHandlers(visitorContext, handlers);
        return runVisitorChain(visitorContext);
    }

    private SQLHandlerChainExecutor runVisitorChain(VisitorContext visitorContext) {
        visitorContext.setStatement(statement);
        visitorContext.runIfActive(() -> statement.accept(new CommonStatementVisitor(visitorContext), null));
        return this;
    }

    @SuppressWarnings("unchecked")
    private static void registerHandlers(VisitorContext visitorContext, Handler<?>... handlers) {
        Arrays.stream(handlers)
                .filter(Objects::nonNull)
                .forEach(handler -> {
                    Class<?> handleType = handler.handleType();
                    if (handleType == null) {
                        throw new IllegalArgumentException("Handler handleType() must not be null");
                    }
                    visitorContext.addSqlHandler(handleType, (Handler<Object>) handler);
                });
    }

    public String getCurrentSql() {
        return statement != null ? statement.toString() : sourceSql;
    }

    public Statement getStatement() {
        return statement;
    }

    public String getSourceSql() {
        return sourceSql;
    }
}
