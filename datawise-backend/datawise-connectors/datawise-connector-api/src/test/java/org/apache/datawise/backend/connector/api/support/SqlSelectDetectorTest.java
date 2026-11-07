package org.apache.datawise.backend.connector.api.support;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SqlSelectDetectorTest {

    @Test
    void detectsPagedSelectStatements() {
        assertTrue(SqlSelectDetector.isPagedSelect("SELECT * FROM users"));
        assertTrue(SqlSelectDetector.isPagedSelect("with cte as (select 1) select * from cte;"));
        assertTrue(SqlSelectDetector.isPagedSelect("""
                SELECT
                  *
                FROM
                  a003.busi_login_log;
                """));
        assertFalse(SqlSelectDetector.isPagedSelect("EXPLAIN SELECT 1"));
        assertFalse(SqlSelectDetector.isPagedSelect("UPDATE users SET name = 'x'"));
    }
}
