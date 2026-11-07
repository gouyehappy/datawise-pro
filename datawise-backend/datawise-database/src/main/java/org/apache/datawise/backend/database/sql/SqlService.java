package org.apache.datawise.backend.database.sql;

import org.apache.datawise.backend.domain.ExecuteSqlRequest;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * SQL 控制台门面：委托 {@link SqlExecuteService} / {@link SqlCursorService}，Controller 无感。
 */
@Service
public class SqlService {

    private final SqlExecuteService executeService;
    private final SqlCursorService cursorService;

    public SqlService(SqlExecuteService executeService, SqlCursorService cursorService) {
        this.executeService = executeService;
        this.cursorService = cursorService;
    }

    public ExecuteSqlResult execute(String sql, String connectionId, String database, Integer maxRows, String sessionKey) {
        return execute(new ExecuteSqlRequest(sql, connectionId, database, maxRows, sessionKey, null, null, null));
    }

    public ExecuteSqlResult execute(ExecuteSqlRequest request) {
        return executeService.execute(request);
    }

    public ExecuteSqlResult fetchCursorPage(String cursorId, Integer pageSizeOverride) {
        return cursorService.fetchCursorPage(cursorId, pageSizeOverride);
    }

    public void closeCursor(String cursorId) {
        cursorService.closeCursor(cursorId);
    }

    public String createCursor(
            long userId,
            String connectionId,
            String database,
            String sql,
            int pageSize,
            int nextOffset,
            List<Map<String, Object>> columns
    ) {
        return cursorService.createCursor(userId, connectionId, database, sql, pageSize, nextOffset, columns);
    }

    public int resolvePageSize(Integer requestedPageSize) {
        return cursorService.resolvePageSize(requestedPageSize);
    }
}
