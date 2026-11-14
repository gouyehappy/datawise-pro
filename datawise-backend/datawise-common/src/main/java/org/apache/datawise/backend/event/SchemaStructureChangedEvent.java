package org.apache.datawise.backend.event;

/**
 * Fired after successful table DDL (CREATE/DROP/ALTER) so AI schema caches can invalidate.
 */
public record SchemaStructureChangedEvent(String tenantId, String connectionId, String database, String tableName) {
}
