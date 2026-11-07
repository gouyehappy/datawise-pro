package org.apache.datawise.backend.domain;

import java.util.List;

/** 表外键关系：本表引用 / 被引用。 */
public record TableRelationsResult(
        String tableName,
        List<TableRelationEdge> references,
        List<TableRelationEdge> referencedBy) {
}
