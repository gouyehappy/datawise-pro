package org.apache.datawise.backend.connector.dm.ops;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DmFamilyDatabaseOpsTest {

    private final DmFamilyDatabaseOps ops = new DmFamilyDatabaseOps();

    @Test
    void supportsDm() {
        assertTrue(ops.supports("dm"));
    }

    @Test
    void buildKillSql_usesSpCloseSession() {
        assertEquals(
                "CALL SP_CLOSE_SESSION(140712523931528)",
                ops.buildKillSql("140712523931528", "connection")
        );
    }
}
