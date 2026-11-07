package org.apache.datawise.backend.ops.render;

import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.domain.LockWaitEdgeDto;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** 锁等待结果解析。 */
public final class LockWaitResultParsing {

    private LockWaitResultParsing() {
    }

    public static List<LockWaitEdgeDto> parseEdges(ExecuteSqlResult result) {
        if (result == null || result.rows() == null) {
            return List.of();
        }
        List<Map<String, Object>> columns = result.columns() != null ? result.columns() : List.of();
        List<LockWaitEdgeDto> edges = new ArrayList<>();
        for (Map<String, Object> row : result.rows()) {
            LockWaitEdgeDto edge = parseRow(row, columns);
            if (edge != null) {
                edges.add(edge);
            }
        }
        return edges;
    }

    private static LockWaitEdgeDto parseRow(Map<String, Object> row, List<Map<String, Object>> columns) {
        String waitingSessionId = OpsRowParsing.asString(OpsRowParsing.cell(row, columns, "waiting_session_id"));
        String blockingSessionId = OpsRowParsing.asString(OpsRowParsing.cell(row, columns, "blocking_session_id"));
        if (waitingSessionId.isBlank() || blockingSessionId.isBlank()) {
            return null;
        }
        return new LockWaitEdgeDto(
                waitingSessionId,
                blockingSessionId,
                OpsRowParsing.asLong(OpsRowParsing.cell(row, columns, "wait_seconds")),
                OpsRowParsing.asString(OpsRowParsing.cell(row, columns, "waiting_sql")),
                OpsRowParsing.asString(OpsRowParsing.cell(row, columns, "blocking_sql")),
                OpsRowParsing.asString(OpsRowParsing.cell(row, columns, "waiting_user")),
                OpsRowParsing.asString(OpsRowParsing.cell(row, columns, "blocking_user")));
    }
}
