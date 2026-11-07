package org.apache.datawise.sqlflow.dialect;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class SqlFlowDialectTest {

    @Test
    void resolvesVendorAliases() {
        assertEquals(SqlFlowDialect.MSSQL, SqlFlowDialect.fromVendorToken("sqlserver"));
        assertEquals(SqlFlowDialect.POSTGRESQL, SqlFlowDialect.fromVendorToken("postgres"));
        assertEquals(SqlFlowDialect.MYSQL, SqlFlowDialect.fromVendorToken("mysql"));
    }
}
