package org.apache.datawise.backend.sync.engine;

import java.sql.Connection;

/** 已打开的源/目标 JDBC 连接对。 */
public record MigrationJdbcSession(
        MigrationEndpoints endpoints,
        Connection sourceConnection,
        Connection targetConnection
) {
}
