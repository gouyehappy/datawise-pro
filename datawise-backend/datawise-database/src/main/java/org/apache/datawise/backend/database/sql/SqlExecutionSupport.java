package org.apache.datawise.backend.database.sql;

import org.apache.datawise.backend.jdbc.error.JdbcConnectionErrors;
import org.apache.datawise.backend.connector.api.support.SqlErrorLineParser;
import org.apache.datawise.backend.common.SqlExecutionException;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.sql.SQLException;

/** SQL 执行与游标分页共享：异常映射与结果拷贝。 */
public final class SqlExecutionSupport {

    private SqlExecutionSupport() {
    }

    public static SqlExecutionException toSqlExecutionException(
            ConnectionEntity entity,
            SQLException ex,
            String sql
    ) {
        Integer errorLine = SqlErrorLineParser.parseLine(ex.getMessage(), sql);
        return new SqlExecutionException(JdbcConnectionErrors.toUserMessage(entity, ex), ex, errorLine);
    }

    public static ExecuteSqlResult withDuration(ExecuteSqlResult result, long durationMs) {
        return new ExecuteSqlResult(
                result.sql(),
                result.rowCount(),
                durationMs,
                result.columns(),
                result.rows(),
                result.where(),
                result.orderBy(),
                result.cursorId(),
                result.hasMore(),
                result.pageOffset(),
                result.pageSize()
        );
    }

    public static ExecuteSqlResult copyWithCursor(
            ExecuteSqlResult page,
            String cursorId,
            boolean hasMore,
            int pageOffset,
            int pageSize
    ) {
        return new ExecuteSqlResult(
                page.sql(),
                page.rowCount(),
                page.durationMs(),
                page.columns(),
                page.rows(),
                page.where(),
                page.orderBy(),
                cursorId,
                hasMore,
                pageOffset,
                pageSize
        );
    }
}
