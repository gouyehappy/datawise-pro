package org.apache.datawise.backend.domain;

import java.util.Map;

public record NotificationDto(
        String id,
        String category,
        String titleKey,
        String bodyKey,
        Map<String, Object> params,
        long createdAt,
        boolean read) {
}
