package org.apache.datawise.backend.connector.gbase8a.dml;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.mysql.dml.MysqlForkDmlDialect;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class Gbase8aFamilyDmlDialectTest {

    private final MysqlForkDmlDialect dialect = new MysqlForkDmlDialect(DbType.GBASE8A, 20);

    @Test
    void supportsGbase8a() {
        assertTrue(dialect.supports("gbase8a"));
    }

    @Test
    void qualifiedTable_usesDatabaseQualifiedNames() {
        assertEquals(
                "`sales`.`orders`",
                dialect.qualifiedTable("sales", "orders")
        );
    }
}
