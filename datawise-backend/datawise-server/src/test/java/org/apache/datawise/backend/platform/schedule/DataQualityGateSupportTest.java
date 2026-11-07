package org.apache.datawise.backend.platform.schedule;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.domain.DataQualityGateScopeResultDto;
import org.apache.datawise.backend.model.ScheduledTaskEntry;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DataQualityGateSupportTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void matchesDqScopeFiltersByConnectionAndDatabase() {
        ScheduledTaskEntry entry = dqEntry("r1", """
                {"connectionId":"conn-1","database":"app","sql":"select 1","blocking":true}
                """);
        assertTrue(DataQualityGateSupport.matchesDqScope(entry, "conn-1", "app", objectMapper));
        assertFalse(DataQualityGateSupport.matchesDqScope(entry, "conn-2", "app", objectMapper));
        assertFalse(DataQualityGateSupport.matchesDqScope(entry, "conn-1", "other", objectMapper));
        assertTrue(DataQualityGateSupport.matchesDqScope(entry, null, null, objectMapper));
    }

    @Test
    void isBlockingRuleAcceptsBooleanAndStringFlags() {
        assertTrue(DataQualityGateSupport.isBlockingRule(
                dqEntry("b1", "{\"connectionId\":\"c\",\"database\":\"d\",\"sql\":\"select 1\",\"blocking\":true}"),
                objectMapper
        ));
        assertTrue(DataQualityGateSupport.isBlockingRule(
                dqEntry("b2", "{\"connectionId\":\"c\",\"database\":\"d\",\"sql\":\"select 1\",\"blocking\":\"yes\"}"),
                objectMapper
        ));
        assertFalse(DataQualityGateSupport.isBlockingRule(
                dqEntry("b3", "{\"connectionId\":\"c\",\"database\":\"d\",\"sql\":\"select 1\"}"),
                objectMapper
        ));
    }

    @Test
    void aggregateMultiEnvSumsScopes() {
        DataQualityGateScopeResultDto primary = new DataQualityGateScopeResultDto(
                "c1", "db", true, 2, 0, List.of()
        );
        DataQualityGateScopeResultDto reference = new DataQualityGateScopeResultDto(
                "c2", "db", false, 3, 1, List.of()
        );
        var result = DataQualityGateSupport.aggregateMultiEnv(primary, reference, List.of());
        assertFalse(result.passed());
        assertEquals(5, result.total());
        assertEquals(1, result.failed());
        assertEquals(2, result.scopes().size());
    }

    private static ScheduledTaskEntry dqEntry(String id, String payloadJson) {
        ScheduledTaskEntry entry = new ScheduledTaskEntry();
        entry.setId(id);
        entry.setName(id);
        entry.setType(ScheduledTaskEntry.TYPE_DATA_QUALITY);
        entry.setPayloadJson(payloadJson);
        return entry;
    }
}
