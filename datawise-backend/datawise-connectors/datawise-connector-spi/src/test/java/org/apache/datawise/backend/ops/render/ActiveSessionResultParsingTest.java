package org.apache.datawise.backend.ops.render;

import org.apache.datawise.backend.domain.ActiveSessionDto;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ActiveSessionResultParsingTest {

    @Test
    void parsesMysqlProcessListRows() {
        ExecuteSqlResult result = new ExecuteSqlResult(
                "SHOW FULL PROCESSLIST",
                1,
                1L,
                List.of(
                        Map.of("key", "c1", "name", "Id"),
                        Map.of("key", "c2", "name", "User"),
                        Map.of("key", "c3", "name", "Host"),
                        Map.of("key", "c4", "name", "db"),
                        Map.of("key", "c5", "name", "Command"),
                        Map.of("key", "c6", "name", "Time"),
                        Map.of("key", "c7", "name", "State"),
                        Map.of("key", "c8", "name", "Info")),
                List.of(Map.of(
                        "c1", 42,
                        "c2", "root",
                        "c3", "localhost",
                        "c4", "cdp_tag",
                        "c5", "Query",
                        "c6", 15,
                        "c7", "Sending data",
                        "c8", "SELECT * FROM cdp_tag")),
                null,
                null,
                null,
                null,
                null,
                null);

        List<ActiveSessionDto> sessions = ActiveSessionResultParsing.parse(result, null, true);
        assertEquals(1, sessions.size());
        ActiveSessionDto session = sessions.get(0);
        assertEquals("42", session.sessionId());
        assertEquals("root", session.user());
        assertEquals("cdp_tag", session.database());
        assertEquals(15L, session.durationSeconds());
        assertTrue(session.sql().contains("cdp_tag"));
    }

    @Test
    void filtersMonitoringQueryRows() {
        ExecuteSqlResult result = new ExecuteSqlResult(
                "SHOW FULL PROCESSLIST",
                2,
                1L,
                List.of(
                        Map.of("key", "c1", "name", "Id"),
                        Map.of("key", "c2", "name", "Info")),
                List.of(
                        Map.of("c1", 1, "c2", "SHOW FULL PROCESSLIST"),
                        Map.of("c1", 2, "c2", "SELECT * FROM users")),
                null,
                null,
                null,
                null,
                null,
                null);

        List<ActiveSessionDto> sessions = ActiveSessionResultParsing.parse(result, null, true);
        assertEquals(1, sessions.size());
        assertEquals("2", sessions.get(0).sessionId());
    }
}
