package org.apache.datawise.backend.connector.db2.ops;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class Db2FamilyDatabaseOpsTest {

    private final Db2FamilyDatabaseOps ops = new Db2FamilyDatabaseOps();

    @Test
    void supportsDb2() {
        assertTrue(ops.supports("db2"));
    }

    @Test
    void buildKillSql_usesSpCloseSession() {
        assertEquals(
                "CALL SP_CLOSE_SESSION(140712523931528)",
                ops.buildKillSql("140712523931528", "connection")
        );
    }
}
