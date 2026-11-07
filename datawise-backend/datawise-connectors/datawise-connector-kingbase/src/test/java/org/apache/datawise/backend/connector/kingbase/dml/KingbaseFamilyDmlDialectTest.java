package org.apache.datawise.backend.connector.kingbase.dml;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.postgresql.dml.PostgresqlForkDmlDialect;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class KingbaseFamilyDmlDialectTest {

    private final PostgresqlForkDmlDialect dialect = new PostgresqlForkDmlDialect(DbType.KINGBASE, 22);

    @Test
    void supportsKingbase() {
        assertTrue(dialect.supports("kingbase"));
    }

    @Test
    void qualifiedTable_usesSchemaQualifiedNames() {
        assertEquals(
                "\"sales\".\"orders\"",
                dialect.qualifiedTable("sales", "orders")
        );
    }
}
