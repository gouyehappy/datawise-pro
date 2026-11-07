package org.apache.datawise.backend.jdbc.execution;

import org.apache.datawise.backend.sql.spi.SqlPaginationService;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

class SqlPaginationSupportTest {

    private final SqlPaginationService pagination = FallbackSqlPaginationService.INSTANCE;

    @Test
    void applyLimitOffset_appendsDirectlyForSimpleSelect() {
        String sql = "SELECT * FROM users WHERE active = 1";
        assertEquals(
                "SELECT * FROM users WHERE active = 1 LIMIT 501 OFFSET 0",
                pagination.applyLimitOffset(sql, "mysql", 501, 0)
        );
    }

    @Test
    void applyLimitOffset_wrapsWhenLimitAlreadyPresent() {
        String sql = "SELECT * FROM users LIMIT 10";
        assertEquals(
                "SELECT * FROM (SELECT * FROM users LIMIT 10) AS _dw_page LIMIT 501 OFFSET 0",
                pagination.applyLimitOffset(sql, "mysql", 501, 0)
        );
    }

    @Test
    void canAppendLimitDirectly_rejectsUnionQueries() {
        assertFalse(SqlPaginationClauseSupport.canAppendLimitDirectly(
                "SELECT id FROM a UNION SELECT id FROM b"
        ));
    }
}
