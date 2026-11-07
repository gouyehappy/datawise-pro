package org.apache.datawise.backend.domain;

import java.util.List;

public record SchemaTablesResult(
        String database,
        List<SchemaTableSummary> tables) {
}
