package org.apache.datawise.backend.service.outbound;

import org.apache.datawise.backend.domain.OutboundWebhookSubscriptionDto;
import org.apache.datawise.backend.domain.SaveOutboundWebhookSubscriptionRequest;
import org.apache.datawise.backend.model.OutboundWebhookEntity;
import org.apache.datawise.backend.model.OutboundWebhookSubscriptionEntity;

import java.util.ArrayList;
import java.util.List;

final class OutboundWebhookSubscriptionSupport {

    private OutboundWebhookSubscriptionSupport() {
    }

    static OutboundWebhookResolvedSubscription resolve(OutboundWebhookEntity webhook, String eventType) {
        if (webhook == null || eventType == null || eventType.isBlank()) {
            return null;
        }
        String type = eventType.trim();
        List<OutboundWebhookSubscriptionEntity> subscriptions = webhook.getSubscriptions();
        if (subscriptions != null && !subscriptions.isEmpty()) {
            for (OutboundWebhookSubscriptionEntity subscription : subscriptions) {
                if (subscription == null || !subscription.isEnabled()) {
                    continue;
                }
                if (type.equals(trim(subscription.getEventType()))) {
                    return resolved(subscription, webhook);
                }
            }
            return null;
        }
        List<String> legacyTypes = webhook.getEventTypes();
        if (legacyTypes != null && !legacyTypes.isEmpty()) {
            boolean matched = legacyTypes.stream().anyMatch(item -> type.equals(trim(item)));
            if (!matched) {
                return null;
            }
        }
        return webhookDefaults(webhook, type);
    }

    /**
     * For admin test / save confirmation: deliver to this webhook even if the event
     * type is not in its subscription list.
     */
    static OutboundWebhookResolvedSubscription resolveForDirectDelivery(
                                                                        OutboundWebhookEntity webhook,
                                                                        String eventType) {
        OutboundWebhookResolvedSubscription matched = resolve(webhook, eventType);
        if (matched != null) {
            return matched;
        }
        if (webhook == null || eventType == null || eventType.isBlank()) {
            return null;
        }
        return webhookDefaults(webhook, eventType.trim());
    }

    private static OutboundWebhookResolvedSubscription webhookDefaults(
                                                                       OutboundWebhookEntity webhook,
                                                                       String type) {
        return new OutboundWebhookResolvedSubscription(
                type,
                null,
                trimToNull(webhook.getMessageTemplate()),
                webhook.isMentionAll(),
                copyList(webhook.getMentionMobiles()),
                copyList(webhook.getMentionUserIds()));
    }

    static List<OutboundWebhookSubscriptionDto> toDtos(OutboundWebhookEntity entity) {
        List<OutboundWebhookSubscriptionEntity> subscriptions = entity.getSubscriptions();
        if (subscriptions != null && !subscriptions.isEmpty()) {
            return subscriptions.stream()
                    .filter(item -> item != null && item.getEventType() != null && !item.getEventType().isBlank())
                    .map(item -> new OutboundWebhookSubscriptionDto(
                            item.getEventType().trim(),
                            item.isEnabled(),
                            item.getTitleTemplate(),
                            item.getBodyTemplate(),
                            item.getMentionAll(),
                            copyList(item.getMentionMobiles()),
                            copyList(item.getMentionUserIds())))
                    .toList();
        }
        List<String> eventTypes = entity.getEventTypes() != null ? entity.getEventTypes() : List.of();
        if (eventTypes.isEmpty()) {
            return List.of();
        }
        return eventTypes.stream()
                .filter(type -> type != null && !type.isBlank())
                .map(type -> new OutboundWebhookSubscriptionDto(
                        type.trim(),
                        true,
                        null,
                        entity.getMessageTemplate(),
                        entity.isMentionAll(),
                        copyList(entity.getMentionMobiles()),
                        copyList(entity.getMentionUserIds())))
                .toList();
    }

    static List<OutboundWebhookSubscriptionEntity> fromRequests(
                                                                List<SaveOutboundWebhookSubscriptionRequest> requests,
                                                                OutboundEventRegistry eventRegistry) {
        if (requests == null || requests.isEmpty()) {
            return List.of();
        }
        List<OutboundWebhookSubscriptionEntity> out = new ArrayList<>();
        for (SaveOutboundWebhookSubscriptionRequest request : requests) {
            if (request == null || request.eventType() == null || request.eventType().isBlank()) {
                continue;
            }
            String type = request.eventType().trim();
            eventRegistry.require(type);
            OutboundWebhookSubscriptionEntity item = new OutboundWebhookSubscriptionEntity();
            item.setEventType(type);
            item.setEnabled(request.enabled() == null || request.enabled());
            item.setTitleTemplate(trimToNull(request.titleTemplate()));
            item.setBodyTemplate(trimToNull(request.bodyTemplate()));
            item.setMentionAll(request.mentionAll());
            item.setMentionMobiles(normalizeMentionList(request.mentionMobiles()));
            item.setMentionUserIds(normalizeMentionList(request.mentionUserIds()));
            out.add(item);
        }
        return out;
    }

    static List<String> enabledEventTypes(List<OutboundWebhookSubscriptionEntity> subscriptions) {
        return subscriptions.stream()
                .filter(OutboundWebhookSubscriptionEntity::isEnabled)
                .map(OutboundWebhookSubscriptionEntity::getEventType)
                .filter(type -> type != null && !type.isBlank())
                .map(String::trim)
                .toList();
    }

    private static OutboundWebhookResolvedSubscription resolved(
                                                                OutboundWebhookSubscriptionEntity subscription,
                                                                OutboundWebhookEntity webhook) {
        return new OutboundWebhookResolvedSubscription(
                trim(subscription.getEventType()),
                trimToNull(subscription.getTitleTemplate()),
                trimToNull(subscription.getBodyTemplate()),
                subscription.getMentionAll() != null ? subscription.getMentionAll() : webhook.isMentionAll(),
                subscription.getMentionMobiles() != null
                        ? copyList(subscription.getMentionMobiles())
                        : copyList(webhook.getMentionMobiles()),
                subscription.getMentionUserIds() != null
                        ? copyList(subscription.getMentionUserIds())
                        : copyList(webhook.getMentionUserIds()));
    }

    static List<String> normalizeMentionList(List<String> values) {
        if (values == null || values.isEmpty()) {
            return List.of();
        }
        List<String> out = new ArrayList<>();
        for (String value : values) {
            if (value == null) {
                continue;
            }
            String trimmed = value.trim();
            if (!trimmed.isEmpty() && !out.contains(trimmed)) {
                out.add(trimmed);
            }
        }
        return out;
    }

    private static List<String> copyList(List<String> values) {
        return values != null ? List.copyOf(values) : List.of();
    }

    private static String trim(String value) {
        return value != null ? value.trim() : null;
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
