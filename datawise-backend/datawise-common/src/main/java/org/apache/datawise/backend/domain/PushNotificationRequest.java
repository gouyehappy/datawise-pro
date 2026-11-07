package org.apache.datawise.backend.domain;

import java.util.Map;

public record PushNotificationRequest(
        String category,
        String titleKey,
        String bodyKey,
        Map<String, Object> params) {
}
