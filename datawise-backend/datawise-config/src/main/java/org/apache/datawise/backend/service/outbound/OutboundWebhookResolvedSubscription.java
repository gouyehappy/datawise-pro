package org.apache.datawise.backend.service.outbound;

import java.util.List;

record OutboundWebhookResolvedSubscription(
        String eventType,
        String titleTemplate,
        String bodyTemplate,
        boolean mentionAll,
        List<String> mentionMobiles,
        List<String> mentionUserIds) {

    OutboundWebhookResolvedSubscription {
        mentionMobiles = mentionMobiles != null ? List.copyOf(mentionMobiles) : List.of();
        mentionUserIds = mentionUserIds != null ? List.copyOf(mentionUserIds) : List.of();
    }
}
