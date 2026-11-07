package org.apache.datawise.backend.connector.flink.dml;

import org.apache.datawise.backend.common.DbType;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class FlinkFamilyDmlDialectTest {

    private final FlinkFamilyDmlDialect dialect = new FlinkFamilyDmlDialect();

    @Test
    void qualifiedTable_usesDoubleQuotesForCatalogSchemaTable() {
        assertEquals(
                DbType.quoteQualifiedTable("Flink", "hive.a003", "agent_test3"),
                dialect.qualifiedTable("hive.a003", "agent_test3")
        );
    }

    @Test
    void quoteIdentifier_usesDoubleQuotes() {
        assertEquals(DbType.TRINO.quoteName("user_name"), dialect.quoteIdentifier("user_name"));
    }
}
