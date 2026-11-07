package org.apache.datawise.backend.sync.engine;

import org.apache.datawise.backend.model.ConnectionEntity;

/** 源/目标连接与库名。 */
public record MigrationEndpoints(
        ConnectionEntity source,
        ConnectionEntity target,
        String sourceDatabase,
        String targetDatabase
) {
}
