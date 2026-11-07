package org.apache.datawise.backend.connector.mysql.ops;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class MysqlProtocolSessionKillOpsTest {

    private final MysqlProtocolSessionKillOps ops = new MysqlProtocolSessionKillOps();

    @Test
    void buildsMysqlKillQuerySql() {
        assertEquals("KILL QUERY 456", ops.buildKillSql("456", "query"));
        assertEquals("KILL 456", ops.buildKillSql("456", "connection"));
    }

    @Test
    void rejectsInvalidSessionId() {
        assertThrows(IllegalArgumentException.class, () -> ops.buildKillSql("abc;drop", "query"));
    }
}
