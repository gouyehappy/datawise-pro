package org.apache.datawise.backend.connector.highgo.dml;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.postgresql.dml.PostgresqlForkDmlDialect;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class HighgoFamilyDmlDialectTest {

    private final PostgresqlForkDmlDialect dialect = new PostgresqlForkDmlDialect(DbType.HIGHGO, 22);

    @Test
    void supportsHighgo() {
        assertTrue(dialect.supports("highgo"));
    }

    @Test
    void qualifiedTable_usesSchemaQualifiedNames() {
        assertEquals(
                "\"sales\".\"orders\"",
                dialect.qualifiedTable("sales", "orders")
        );
    }
}
