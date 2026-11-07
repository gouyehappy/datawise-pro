package org.apache.datawise.backend.connector.presto.dml;

import org.apache.datawise.backend.common.DbType;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class PrestoFamilyDmlDialectTest {

    private final PrestoFamilyDmlDialect dialect = new PrestoFamilyDmlDialect();

    @Test
    void qualifiedTable_usesDoubleQuotesForCatalogSchemaTable() {
        assertEquals(
                DbType.quoteQualifiedTable("presto", "hive.a003", "agent_test3"),
                dialect.qualifiedTable("hive.a003", "agent_test3")
        );
    }

    @Test
    void quoteIdentifier_usesDoubleQuotes() {
        assertEquals(DbType.TRINO.quoteName("user_name"), dialect.quoteIdentifier("user_name"));
    }
}
