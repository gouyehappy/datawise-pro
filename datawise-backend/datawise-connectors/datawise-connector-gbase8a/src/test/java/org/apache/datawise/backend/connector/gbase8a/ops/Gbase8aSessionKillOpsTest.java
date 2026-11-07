package org.apache.datawise.backend.connector.gbase8a.ops;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.mysql.ops.MysqlForkSessionKillOps;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class Gbase8aSessionKillOpsTest {

    private final MysqlForkSessionKillOps ops = new MysqlForkSessionKillOps(DbType.GBASE8A, 21);

    @Test
    void supportsGbase8a() {
        assertTrue(ops.supports("gbase8a"));
    }

    @Test
    void buildKillSql_usesKillStatement() {
        assertEquals("KILL 42", ops.buildKillSql("42", "connection"));
        assertEquals("KILL QUERY 42", ops.buildKillSql("42", "query"));
    }
}
