package org.apache.datawise.backend.jdbc.execution.pagination;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.sql.spi.SqlPaginationDialect;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class OrderByOffsetFetchSqlPaginationDialectTest {

    private final SqlPaginationDialect oracle = new OrderByOffsetFetchSqlPaginationDialect() {
        @Override
        public boolean supports(String dbType) {
            return DbType.ORACLE.matches(dbType);
        }

        @Override
        public int priority() {
            return 21;
        }

        @Override
        protected String paginationClause(int limit, int offset) {
            return " OFFSET " + offset + " ROWS FETCH NEXT " + limit + " ROWS ONLY";
        }
    };

    @Test
    void applyLimitOffset_addsOrderByForOracleOffsetFetch() {
        String sql = "SELECT * FROM \"DBSDBA\".\"TEST_ORACLE01\"";
        assertEquals(
                "SELECT * FROM \"DBSDBA\".\"TEST_ORACLE01\" ORDER BY 1 OFFSET 0 ROWS FETCH NEXT 101 ROWS ONLY",
                oracle.applyLimitOffset(sql, 101, 0)
        );
    }

    @Test
    void applyLimitOffset_preservesExistingOrderBy() {
        String sql = "SELECT * FROM users ORDER BY id";
        assertEquals(
                "SELECT * FROM users ORDER BY id OFFSET 10 ROWS FETCH NEXT 50 ROWS ONLY",
                oracle.applyLimitOffset(sql, 50, 10)
        );
    }
}
