package org.apache.datawise.backend.connector.gaussdb.dml;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.postgresql.dml.PostgresqlForkDmlDialect;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GaussdbFamilyDmlDialectTest {

    private final PostgresqlForkDmlDialect dialect = new PostgresqlForkDmlDialect(DbType.GAUSSDB, 22);

    @Test
    void supportsGaussdb() {
        assertTrue(dialect.supports("gaussdb"));
    }

    @Test
    void qualifiedTable_usesSchemaQualifiedNames() {
        assertEquals(
                "\"sales\".\"orders\"",
                dialect.qualifiedTable("sales", "orders")
        );
    }
}
