package org.apache.datawise.backend.schema;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

class SchemaNodeIdsTest {

    @Test
    void workspaceSqlFileNodeIdIsDeterministicFromConnectionInstanceAndFileName() {
        String id = SchemaNodeIds.workspaceSqlFileNodeId("conn-1", "admin_db", "Script-1.sql");
        assertEquals(id, SchemaNodeIds.workspaceSqlFileNodeId("conn-1", "admin_db", "Script-1.sql"));
        assertEquals(
                "ws-file-conn_1-admin_db-" + SchemaNodeIds.encodeSqlFileNameKey("Script-1.sql"),
                id);
    }

    @Test
    void workspaceSqlFileNodeIdDiffersForDistinctCjkFileNames() {
        String left = SchemaNodeIds.workspaceSqlFileNodeId("conn-1", "admin_db", "智能分群.sql");
        String right = SchemaNodeIds.workspaceSqlFileNodeId("conn-1", "admin_db", "智能标签.sql");
        assertNotEquals(left, right);
    }

    @Test
    void encodeSqlFileNameKeyNormalizesCase() {
        assertEquals(
                SchemaNodeIds.encodeSqlFileNameKey("Script-1.sql"),
                SchemaNodeIds.encodeSqlFileNameKey("script-1.sql"));
    }
}
