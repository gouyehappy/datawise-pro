package org.apache.datawise.backend.connector.oracle.ops;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OracleFamilyDatabaseOpsTest {

    private final OracleFamilyDatabaseOps ops = new OracleFamilyDatabaseOps();

    @Test
    void supportsOracle() {
        assertTrue(ops.supports("oracle"));
    }

    @Test
    void buildKillSql_usesAlterSystemKillSession() {
        assertEquals(
                "ALTER SYSTEM KILL SESSION '123,456' IMMEDIATE",
                ops.buildKillSql("123,456", "connection")
        );
        assertEquals(
                "ALTER SYSTEM KILL SESSION '123,*' IMMEDIATE",
                ops.buildKillSql("123", "connection")
        );
    }
}
