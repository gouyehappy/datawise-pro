package org.apache.datawise.backend.connector.postgresql.ops;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class PostgresqlFamilyDatabaseOpsTest {

    private final PostgresqlFamilyDatabaseOps ops = new PostgresqlFamilyDatabaseOps();

    @Test
    void buildsPostgresqlCancelSql() {
        assertEquals(
                "SELECT pg_cancel_backend(123)",
                ops.buildKillSql("123", "query")
        );
        assertEquals(
                "SELECT pg_terminate_backend(123)",
                ops.buildKillSql("123", "connection")
        );
    }
}
