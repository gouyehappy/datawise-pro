package org.apache.datawise.sqlparser;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.sqlparser.analysis.SqlAnalysisSupport;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SqlTransformOpsTest {

    @Test
    void replaceSelectStarExpandsMainQueryColumns() {
        String sql = SqlTransformOps.replaceSelectStar(
                "SELECT * FROM users WHERE active = 1",
                "id", "name", "email"
        );
        assertTrue(sql.toLowerCase().contains("select id, name, email"));
        assertFalse(sql.contains("*"));
    }

    @Test
    void selectAllFromBuildsStarSelect() {
        String sql = SqlTransformOps.selectAllFrom("orders");
        assertTrue(sql.toLowerCase().contains("select * from"));
        assertTrue(sql.contains("orders"));
    }

    @Test
    void buildSelectAllQuotesQualifiedTable() {
        String sql = SqlTransformOps.buildSelectAll(DbType.MYSQL.id(), "shop", "orders");
        assertTrue(sql.contains("shop"));
        assertTrue(sql.contains("orders"));
        assertTrue(sql.toLowerCase().contains("select * from"));
    }

    @Test
    void containsSelectStarDetectsStarSelect() {
        assertTrue(SqlAnalysisSupport.containsSelectStar("SELECT * FROM users"));
        assertFalse(SqlAnalysisSupport.containsSelectStar("SELECT id FROM users"));
    }
}
