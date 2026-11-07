package org.apache.datawise.backend.domain;

import java.util.List;

/** Schema / 库级外键关系，用于 ER 图展示全部表。 */
public record SchemaRelationsResult(
        String database,
        List<String> tables,
        List<TableRelationEdge> edges) {
}
