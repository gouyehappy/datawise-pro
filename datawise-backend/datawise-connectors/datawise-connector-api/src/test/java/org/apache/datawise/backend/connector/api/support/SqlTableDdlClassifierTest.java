package org.apache.datawise.backend.connector.api.support;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

class SqlTableDdlClassifierTest {

    @Test
    void matchesCreateTable() {
        SqlTableDdlClassifier.Match match = SqlTableDdlClassifier.match(
                "CREATE TABLE IF NOT EXISTS `shop`.`orders` (id INT)");
        assertNotNull(match);
        assertEquals(SqlTableDdlClassifier.Kind.CREATE, match.kind());
        assertEquals("orders", match.tableName());
    }

    @Test
    void matchesDropTable() {
        SqlTableDdlClassifier.Match match = SqlTableDdlClassifier.match(
                "DROP TABLE IF EXISTS shop.orders");
        assertNotNull(match);
        assertEquals(SqlTableDdlClassifier.Kind.DROP, match.kind());
        assertEquals("orders", match.tableName());
    }

    @Test
    void matchesAlterTable() {
        SqlTableDdlClassifier.Match match = SqlTableDdlClassifier.match(
                "ALTER TABLE `shop`.`orders` ADD COLUMN n INT");
        assertNotNull(match);
        assertEquals(SqlTableDdlClassifier.Kind.ALTER, match.kind());
        assertEquals("orders", match.tableName());
    }

    @Test
    void ignoresNonTableDdl() {
        assertNull(SqlTableDdlClassifier.match("CREATE VIEW v AS SELECT 1"));
        assertNull(SqlTableDdlClassifier.match("TRUNCATE TABLE orders"));
        assertNull(SqlTableDdlClassifier.match("SELECT * FROM orders"));
    }
}
