package org.apache.datawise.backend.domain;

import java.util.List;

public record TableMigrationPreflightRequest(
        String sourceConnectionId,
        String sourceDatabase,
        String targetConnectionId,
        String targetDatabase,
        List<String> tableNames,
        String whereClause) {
}
