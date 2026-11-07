package org.apache.datawise.backend.jdbc.execution;

import org.apache.datawise.backend.common.SqlDeepOffsetException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertThrows;

class JdbcDeepOffsetGuardTest {

    @Test
    void executeSelectPageOnConnection_rejectsDeepOffsetBeyondLimit() {
        JdbcTableDataReader reader = new JdbcTableDataReader(null, null, null, 0, 10);
        assertThrows(
                SqlDeepOffsetException.class,
                () -> reader.executeSelectPageOnConnection(null, "mysql", "select 1", 10, 11)
        );
    }
}
