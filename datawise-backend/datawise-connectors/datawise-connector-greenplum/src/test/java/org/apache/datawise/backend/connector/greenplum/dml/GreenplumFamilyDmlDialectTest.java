package org.apache.datawise.backend.connector.greenplum.dml;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.postgresql.dml.PostgresqlForkDmlDialect;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GreenplumFamilyDmlDialectTest {

    private final PostgresqlForkDmlDialect dialect = new PostgresqlForkDmlDialect(DbType.GREENPLUM, 22);

    @Test
    void supportsGreenplum() {
        assertTrue(dialect.supports("greenplum"));
    }

    @Test
    void qualifiedTable_usesSchemaQualifiedNames() {
        assertEquals(
                "\"sales\".\"orders\"",
                dialect.qualifiedTable("sales", "orders")
        );
    }
}
