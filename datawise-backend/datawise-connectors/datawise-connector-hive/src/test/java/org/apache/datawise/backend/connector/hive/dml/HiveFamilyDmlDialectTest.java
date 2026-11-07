package org.apache.datawise.backend.connector.hive.dml;

import org.apache.datawise.backend.common.DbType;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class HiveFamilyDmlDialectTest {

    private final HiveFamilyDmlDialect dialect = new HiveFamilyDmlDialect();

    @Test
    void qualifiedTable_usesBackticksForCatalogSchemaTable() {
        assertEquals(
                "`hive`.`default`.`users`",
                dialect.qualifiedTable("hive.default", "users")
        );
    }

    @Test
    void qualifiedTable_stripsSyntheticMainCatalog() {
        assertEquals(
                "`a003`.`gxc_test`",
                dialect.qualifiedTable("main.a003", "gxc_test")
        );
    }

    @Test
    void quoteIdentifier_usesBackticks() {
        assertEquals(DbType.HIVE.quoteName("user_name"), dialect.quoteIdentifier("user_name"));
    }
}
