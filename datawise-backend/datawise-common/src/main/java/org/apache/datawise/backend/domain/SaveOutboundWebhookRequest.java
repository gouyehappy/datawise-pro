package org.apache.datawise.backend.domain;

import jakarta.validation.constraints.NotBlank;

import java.util.List;

public record SaveOutboundWebhookRequest(
        String id,
        @NotBlank(message = "name is required") String name,
        Boolean enabled,
        String channel,
        @NotBlank(message = "url is required") String url,
        String secret,
        List<String> eventTypes,
        List<SaveOutboundWebhookSubscriptionRequest> subscriptions,
        Integer timeoutMs,
        Boolean includeSql,
        String messageTemplate,
        Boolean mentionAll,
        List<String> mentionMobiles,
        List<String> mentionUserIds) {
}
