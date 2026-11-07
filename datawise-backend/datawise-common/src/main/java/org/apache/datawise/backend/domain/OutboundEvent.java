package org.apache.datawise.backend.domain;

import java.time.Instant;
import java.util.Map;

/**
 * Internal outbound notification event (fan-out to webhooks / future channels).
 */
public record OutboundEvent(
        String id,
        String type,
        Instant occurredAt,
        String title,
        String body,
        Map<String, Object> data) {

    public OutboundEvent {
        if (data == null) {
            data = Map.of();
        }
    }
}
