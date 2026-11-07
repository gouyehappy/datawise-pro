package org.apache.datawise.backend.domain.pack;

import java.util.List;

/** Append-only pack entitlement audit log (persisted under config/packs/audit.json). */
public record PackAuditDocument(List<PackAuditEvent> events) {

    public static PackAuditDocument empty() {
        return new PackAuditDocument(List.of());
    }

    public record PackAuditEvent(
            String id,
            String at,
            String action,
            String packId,
            String detail,
            String actor) {
    }
}
