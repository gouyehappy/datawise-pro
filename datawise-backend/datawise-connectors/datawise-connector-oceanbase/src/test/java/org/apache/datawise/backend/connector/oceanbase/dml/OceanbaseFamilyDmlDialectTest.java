package org.apache.datawise.backend.connector.oceanbase.dml;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.mysql.dml.MysqlForkDmlDialect;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OceanbaseFamilyDmlDialectTest {

    private final MysqlForkDmlDialect dialect = new MysqlForkDmlDialect(DbType.OCEANBASE, 22);

    @Test
    void supportsOceanbase() {
        assertTrue(dialect.supports("oceanbase"));
    }

    @Test
    void qualifiedTable_usesDatabaseQualifiedNames() {
        assertEquals(
                "`sales`.`orders`",
                dialect.qualifiedTable("sales", "orders")
        );
    }
}
