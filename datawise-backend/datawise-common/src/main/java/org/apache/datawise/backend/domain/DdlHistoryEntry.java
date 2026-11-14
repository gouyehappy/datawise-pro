package org.apache.datawise.backend.domain;

import java.time.Instant;

/** MetaForge B1：一次成功执行的表级 DDL 历史记录。 */
public record DdlHistoryEntry(
        String id,
        Instant at,
        Long userId,
        String connectionId,
        String database,
        String objectName,
        String objectKind,
        String action,
        String sql
) {
}
