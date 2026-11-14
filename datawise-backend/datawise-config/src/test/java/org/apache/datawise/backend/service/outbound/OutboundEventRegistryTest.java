package org.apache.datawise.backend.service.outbound;

import org.apache.datawise.backend.domain.OutboundEventCategory;
import org.apache.datawise.backend.domain.OutboundEventType;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OutboundEventRegistryTest {

    private final OutboundEventRegistry registry = new OutboundEventRegistry();

    @Test
    void listDefinitionsIncludesKnownEventTypes() {
        assertFalse(registry.listDefinitions().isEmpty());
        assertTrue(registry.listDefinitions().stream()
                .anyMatch(item -> OutboundEventType.CONNECTION_HEALTH_FAILED.equals(item.type())));
        assertTrue(registry.listDefinitions().stream()
                .anyMatch(item -> OutboundEventType.CONNECTION_CREATED.equals(item.type())));
        assertTrue(registry.listDefinitions().stream()
                .anyMatch(item -> OutboundEventType.CONNECTION_DELETED.equals(item.type())));
        assertTrue(registry.listDefinitions().stream()
                .anyMatch(item -> OutboundEventType.TABLE_CREATED.equals(item.type())));
        assertTrue(registry.listDefinitions().stream()
                .anyMatch(item -> OutboundEventType.TABLE_DELETED.equals(item.type())));
        assertTrue(registry.listDefinitions().stream()
                .anyMatch(item -> OutboundEventType.TABLE_ALTERED.equals(item.type())));
    }

    @Test
    void listDefinitionsAssignsSceneCategories() {
        var altered = registry.listDefinitions().stream()
                .filter(item -> OutboundEventType.TABLE_ALTERED.equals(item.type()))
                .findFirst()
                .orElseThrow();
        assertEquals(OutboundEventCategory.SCHEMA, altered.category());

        var backup = registry.listDefinitions().stream()
                .filter(item -> OutboundEventType.BACKUP_OK.equals(item.type()))
                .findFirst()
                .orElseThrow();
        assertEquals(OutboundEventCategory.TASK, backup.category());

        assertTrue(registry.listDefinitions().stream()
                .allMatch(item -> item.category() != null && !item.category().isBlank()));
    }

    @Test
    void createEventUsesRegistryTemplates() {
        var event = registry.createEvent(
                "evt-1",
                OutboundEventType.CONNECTION_HEALTH_FAILED,
                Instant.parse("2026-01-01T00:00:00Z"),
                Map.of(
                        "connectionId", "conn-1",
                        "name", "prod-mysql",
                        "message", "timeout",
                        "latencyMs", 120),
                null,
                null);

        assertEquals("连接健康异常：prod-mysql", event.title());
        assertTrue(event.body().contains("conn-1"));
        assertTrue(event.body().contains("timeout"));
    }
}
