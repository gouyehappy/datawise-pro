package org.apache.datawise.backend.domain;

import java.util.List;

public record OutboundWebhookSubscriptionDto(
        String eventType,
        boolean enabled,
        String titleTemplate,
        String bodyTemplate,
        Boolean mentionAll,
        List<String> mentionMobiles,
        List<String> mentionUserIds) {
}
