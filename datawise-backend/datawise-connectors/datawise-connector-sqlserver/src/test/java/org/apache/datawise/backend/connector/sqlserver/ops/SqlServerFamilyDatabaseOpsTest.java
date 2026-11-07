package org.apache.datawise.backend.connector.sqlserver.ops;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SqlServerFamilyDatabaseOpsTest {

    private final SqlServerFamilyDatabaseOps ops = new SqlServerFamilyDatabaseOps();

    @Test
    void supportsSqlServerFamily() {
        assertTrue(ops.supports("sqlserver"));
        assertTrue(ops.supports("mssql"));
    }

    @Test
    void buildsKillSql() {
        assertEquals("KILL 52", ops.buildKillSql("52", "connection"));
    }
}
