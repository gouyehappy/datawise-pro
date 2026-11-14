package org.apache.datawise.backend.domain;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OutboundEventCategoryTest {

    @Test
    void mapsPrefixesToSixSceneBuckets() {
        assertEquals(OutboundEventCategory.TASK, OutboundEventCategory.of(OutboundEventType.BACKUP_FAILED));
        assertEquals(OutboundEventCategory.CONNECTION, OutboundEventCategory.of(OutboundEventType.CONNECTION_CREATED));
        assertEquals(OutboundEventCategory.SCHEMA, OutboundEventCategory.of(OutboundEventType.TABLE_ALTERED));
        assertEquals(OutboundEventCategory.QUALITY, OutboundEventCategory.of(OutboundEventType.INSIGHT_DIGEST));
        assertEquals(OutboundEventCategory.SECURITY, OutboundEventCategory.of(OutboundEventType.SQL_PRODUCTION_BLOCKED));
        assertEquals(OutboundEventCategory.SYSTEM, OutboundEventCategory.of(OutboundEventType.AI_QUOTA_EXHAUSTED));
        assertEquals(6, OutboundEventCategory.all().size());
        assertTrue(OutboundEventCategory.all().contains(OutboundEventCategory.SCHEMA));
    }
}
