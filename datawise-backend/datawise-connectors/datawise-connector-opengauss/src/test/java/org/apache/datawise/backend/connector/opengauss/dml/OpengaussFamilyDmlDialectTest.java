package org.apache.datawise.backend.connector.opengauss.dml;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.postgresql.dml.PostgresqlForkDmlDialect;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OpengaussFamilyDmlDialectTest {

    private final PostgresqlForkDmlDialect dialect = new PostgresqlForkDmlDialect(DbType.OPENGAUSS, 22);

    @Test
    void supportsOpengauss() {
        assertTrue(dialect.supports("opengauss"));
    }

    @Test
    void qualifiedTable_usesSchemaQualifiedNames() {
        assertEquals(
                "\"sales\".\"orders\"",
                dialect.qualifiedTable("sales", "orders")
        );
    }
}
