package org.apache.datawise.backend.domain;

import java.util.List;

public record OutboundWebhookDto(
        String id,
        String name,
        boolean enabled,
        String channel,
        String url,
        boolean hasSecret,
        List<String> eventTypes,
        List<OutboundWebhookSubscriptionDto> subscriptions,
        int timeoutMs,
        boolean includeSql,
        String createdAt,
        String updatedAt,
        String lastSuccessAt,
        String lastFailureAt,
        String lastError,
        String messageTemplate,
        boolean mentionAll,
        List<String> mentionMobiles,
        List<String> mentionUserIds) {
}
