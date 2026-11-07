package org.apache.datawise.backend.ops.render;

import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.domain.LockWaitEdgeDto;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LockWaitResultParsingTest {

    @Test
    void parsesLockWaitEdges() {
        ExecuteSqlResult result = new ExecuteSqlResult(
                "lock-waits",
                1,
                1L,
                List.of(
                        Map.of("key", "c1", "name", "waiting_session_id"),
                        Map.of("key", "c2", "name", "blocking_session_id"),
                        Map.of("key", "c3", "name", "wait_seconds"),
                        Map.of("key", "c4", "name", "waiting_sql"),
                        Map.of("key", "c5", "name", "blocking_sql"),
                        Map.of("key", "c6", "name", "waiting_user"),
                        Map.of("key", "c7", "name", "blocking_user")),
                List.of(Map.of(
                        "c1", 456,
                        "c2", 123,
                        "c3", 15,
                        "c4", "UPDATE orders SET status = 1",
                        "c5", "SELECT * FROM orders WHERE id = 1 FOR UPDATE",
                        "c6", "app",
                        "c7", "root")),
                null,
                null,
                null,
                null,
                null,
                null);

        List<LockWaitEdgeDto> edges = LockWaitResultParsing.parseEdges(result);
        assertEquals(1, edges.size());
        LockWaitEdgeDto edge = edges.get(0);
        assertEquals("456", edge.waitingSessionId());
        assertEquals("123", edge.blockingSessionId());
        assertEquals(15L, edge.waitSeconds());
        assertTrue(edge.waitingSql().contains("UPDATE orders"));
    }
}
