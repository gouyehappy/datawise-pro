package org.apache.datawise.backend.database.sql;

import net.sf.jsqlparser.JSQLParserException;
import org.apache.datawise.backend.config.SqlRewriteProperties;
import org.apache.datawise.backend.connector.spi.SqlExecutionHook;
import org.apache.datawise.backend.connector.spi.SqlExecutionHookContext;
import org.apache.datawise.backend.connector.spi.SqlExecutionHookResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.service.ConnectionVisibilityService;
import org.apache.datawise.sqlparser.SqlRewriteService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Built-in execution hook that applies sqlparser identifier quoting before SQL reaches the database.
 */
@Component
public class IdentifierQuoteSqlExecutionHook implements SqlExecutionHook {

    private static final Logger log = LoggerFactory.getLogger(IdentifierQuoteSqlExecutionHook.class);

    private final SqlRewriteProperties properties;
    private final ConnectionVisibilityService connectionVisibilityService;

    public IdentifierQuoteSqlExecutionHook(
            SqlRewriteProperties properties,
            ConnectionVisibilityService connectionVisibilityService
    ) {
        this.properties = properties;
        this.connectionVisibilityService = connectionVisibilityService;
    }

    @Override
    public String id() {
        return "sqlparser-identifier-quote";
    }

    @Override
    public int priority() {
        return Integer.MIN_VALUE;
    }

    @Override
    public SqlExecutionHookResult beforeExecute(SqlExecutionHookContext context) {
        if (!properties.isQuoteIdentifiers() || context.sql() == null || context.sql().isBlank()) {
            return SqlExecutionHookResult.proceed(context.sql());
        }
        String dbType = connectionVisibilityService.resolveConnectionEntity(context.connectionId())
                .map(ConnectionEntity::getDbType)
                .orElse(null);
        if (dbType == null || dbType.isBlank()) {
            return SqlExecutionHookResult.proceed(context.sql());
        }
        try {
            return SqlExecutionHookResult.proceed(
                    SqlRewriteService.quoteIdentifiers(context.sql(), dbType)
            );
        } catch (JSQLParserException ex) {
            log.debug("Skip SQL identifier rewrite in hook: {}", ex.getMessage());
            return SqlExecutionHookResult.proceed(context.sql());
        }
    }
}
