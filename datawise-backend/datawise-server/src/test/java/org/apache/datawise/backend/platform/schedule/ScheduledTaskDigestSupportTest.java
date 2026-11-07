package org.apache.datawise.backend.platform.schedule;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ScheduledTaskDigestSupportTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void resolveDigestMaxRowsClampsBounds() {
        ObjectNode payload = objectMapper.createObjectNode();
        assertEquals(ScheduledTaskDigestSupport.DEFAULT_DIGEST_MAX_ROWS,
                ScheduledTaskDigestSupport.resolveDigestMaxRows(payload));

        payload.put("digestMaxRows", 0);
        assertEquals(1, ScheduledTaskDigestSupport.resolveDigestMaxRows(payload));

        payload.put("digestMaxRows", 999);
        assertEquals(ScheduledTaskDigestSupport.HARD_DIGEST_MAX_ROWS,
                ScheduledTaskDigestSupport.resolveDigestMaxRows(payload));
    }

    @Test
    void buildSqlDigestTruncatesRows() {
        ExecuteSqlResult result = new ExecuteSqlResult(
                "select 1",
                3,
                1L,
                List.of(Map.of("name", "id")),
                List.of(Map.of("id", 1), Map.of("id", 2), Map.of("id", 3)),
                null,
                null,
                null,
                false,
                null,
                null
        );
        Map<String, Object> digest = ScheduledTaskDigestSupport.buildSqlDigest(result, 1);
        assertEquals(3, digest.get("rowCount"));
        assertEquals(List.of("id"), digest.get("columns"));
        assertEquals(1, ((List<?>) digest.get("rows")).size());
        assertTrue((Boolean) digest.get("truncated"));
    }

    @Test
    void clipAddsEllipsis() {
        assertEquals("abc", ScheduledTaskDigestSupport.clip("abc", 10));
        assertEquals("ab...", ScheduledTaskDigestSupport.clip("abcdef", 5));
        assertEquals("", ScheduledTaskDigestSupport.clip(null, 5));
    }

    @Test
    void buildCanvasDigestMarksSummaryTruncation() {
        Map<String, Object> digest = ScheduledTaskDigestSupport.buildCanvasDigest(
                "c1",
                "Title",
                2,
                "x".repeat(500),
                "select 1",
                1
        );
        assertEquals("c1", digest.get("canvasId"));
        assertTrue((Boolean) digest.get("summaryTruncated"));
        assertFalse(digest.get("summary").toString().isBlank());
        assertTrue(digest.containsKey("sql"));
    }
}
