package org.apache.datawise.sqlparser;

import net.sf.jsqlparser.JSQLParserException;
import org.apache.datawise.backend.common.DbType;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SqlTransformTest {

    @Test
    void limitAddedWhenAbsent() throws JSQLParserException {
        String sql = SqlTransform.of("select id from orders", DbType.MYSQL)
                .limit(1000)
                .toSql();
        assertTrue(sql.toLowerCase().contains("limit 1000"));
    }

    @Test
    void limitLoweredWhenLargerThanCap() throws JSQLParserException {
        String sql = SqlTransform.of("select id from orders limit 5000", DbType.MYSQL)
                .limit(1000)
                .toSql();
        assertTrue(sql.toLowerCase().contains("limit 1000"));
        assertFalse(sql.contains("5000"));
    }

    @Test
    void limitKeptWhenWithinCap() throws JSQLParserException {
        String sql = SqlTransform.of("select id from orders limit 10", DbType.MYSQL)
                .limit(1000)
                .toSql();
        assertTrue(sql.toLowerCase().contains("limit 10"));
    }

    @Test
    void appendWhereToQueryWithoutWhere() throws JSQLParserException {
        String sql = SqlTransform.of("select id from orders", DbType.MYSQL)
                .appendWhere("tenant_id = 42")
                .toSql();
        assertTrue(sql.toLowerCase().contains("where tenant_id = 42"));
    }

    @Test
    void appendWhereAndsWithExistingWhere() throws JSQLParserException {
        String sql = SqlTransform.of("select id from orders where status = 1", DbType.MYSQL)
                .appendWhere("tenant_id = 42")
                .toSql();
        String lower = sql.toLowerCase();
        assertTrue(lower.contains("status = 1"));
        assertTrue(lower.contains("tenant_id = 42"));
        assertTrue(lower.contains(" and "));
    }

    @Test
    void orderByAddedWhenAbsent() throws JSQLParserException {
        String sql = SqlTransform.of("select id from orders", DbType.MYSQL)
                .orderByAsc("id")
                .toSql();
        assertTrue(sql.toLowerCase().contains("order by id asc"));
    }

    @Test
    void orderByNotOverriddenWhenPresent() throws JSQLParserException {
        String sql = SqlTransform.of("select id from orders order by name desc", DbType.MYSQL)
                .orderByAsc("id")
                .toSql();
        String lower = sql.toLowerCase();
        assertTrue(lower.contains("order by name desc"));
        assertFalse(lower.contains("order by id"));
    }

    @Test
    void subQueryLimitNotAffected() throws JSQLParserException {
        String sql = SqlTransform.of(
                        "select * from (select id from orders) t",
                        DbType.MYSQL)
                .limit(100)
                .toSql();
        String lower = sql.toLowerCase();
        assertTrue(lower.endsWith("limit 100") || lower.contains(") t limit 100"));
        assertEquals(1, countOccurrences(lower, "limit 100"));
    }

    @Test
    void limitOffsetAddsLimitAndOffset() throws JSQLParserException {
        String sql = SqlTransform.of("select id from orders", DbType.MYSQL)
                .limitOffset(100, 1000)
                .toSql();
        String lower = sql.toLowerCase();
        assertTrue(lower.contains("limit 1000, 100") || lower.contains("offset 1000"));
    }

    @Test
    void composedTransformsChainTogether() throws JSQLParserException {
        String sql = SqlTransform.of("select id from orders", DbType.MYSQL)
                .appendWhere("deleted = 0")
                .orderByAsc("id")
                .limit(500)
                .toSql();
        String lower = sql.toLowerCase();
        assertTrue(lower.contains("where deleted = 0"));
        assertTrue(lower.contains("order by id asc"));
        assertTrue(lower.contains("limit 500"));
    }

    private static int countOccurrences(String haystack, String needle) {
        int count = 0;
        int idx = 0;
        while ((idx = haystack.indexOf(needle, idx)) != -1) {
            count++;
            idx += needle.length();
        }
        return count;
    }
}
