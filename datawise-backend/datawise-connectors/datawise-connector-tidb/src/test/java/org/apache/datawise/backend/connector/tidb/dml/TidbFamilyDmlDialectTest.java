package org.apache.datawise.backend.connector.tidb.dml;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.mysql.dml.MysqlForkDmlDialect;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class TidbFamilyDmlDialectTest {

    private final MysqlForkDmlDialect dialect = new MysqlForkDmlDialect(DbType.TIDB, 21);

    @Test
    void supportsTidb() {
        assertTrue(dialect.supports("tidb"));
    }
}
