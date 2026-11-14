package org.apache.datawise.backend.common.truncation;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * T-TRUNC-1：统一截断元数据（加法字段，不替代 hasMore / cursor*）。
 */
public record TruncationMeta(
        boolean truncated,
        Long originalLength,
        Integer limit,
        String unit,
        String reason
) {
    public static TruncationMeta of(
            boolean truncated,
            long originalLength,
            int limit,
            String unit,
            String reason
    ) {
        return new TruncationMeta(truncated, originalLength, limit, unit, reason);
    }

    public Map<String, Object> toMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("truncated", truncated);
        if (originalLength != null) {
            map.put("originalLength", originalLength);
        }
        if (limit != null) {
            map.put("limit", limit);
        }
        if (unit != null && !unit.isBlank()) {
            map.put("unit", unit);
        }
        if (reason != null && !reason.isBlank()) {
            map.put("reason", reason);
        }
        return map;
    }
}
