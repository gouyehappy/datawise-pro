package org.apache.datawise.backend.domain;

import java.util.List;
import java.util.Locale;

/**
 * MetaForge B2：出站通知场景分类（6 类），用于 webhook 订阅 UI 分组与过滤。
 * 与 {@link OutboundEventType} 正交：type 是具体事件，category 是场景桶。
 */
public final class OutboundEventCategory {

    public static final String TASK = "task";
    public static final String CONNECTION = "connection";
    public static final String SCHEMA = "schema";
    public static final String QUALITY = "quality";
    public static final String SECURITY = "security";
    public static final String SYSTEM = "system";

    private OutboundEventCategory() {
    }

    public static List<String> all() {
        return List.of(TASK, CONNECTION, SCHEMA, QUALITY, SECURITY, SYSTEM);
    }

    /** Map a concrete event type id to its scene category. */
    public static String of(String eventType) {
        if (eventType == null || eventType.isBlank()) {
            return SYSTEM;
        }
        String type = eventType.trim().toLowerCase(Locale.ROOT);
        if (type.startsWith("scheduled_task.")
                || type.startsWith("orchestration.")
                || type.startsWith("migration.")
                || type.startsWith("backup.")) {
            return TASK;
        }
        if (type.startsWith("connection.")) {
            return CONNECTION;
        }
        if (type.startsWith("table.") || type.startsWith("schema_drift.")) {
            return SCHEMA;
        }
        if (type.startsWith("data_quality.") || type.startsWith("insight.")) {
            return QUALITY;
        }
        if (type.startsWith("prod.")
                || type.startsWith("audit.")
                || type.startsWith("team.")
                || OutboundEventType.SQL_PRODUCTION_BLOCKED.equals(type)) {
            return SECURITY;
        }
        return SYSTEM;
    }
}
