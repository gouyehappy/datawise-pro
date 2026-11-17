package org.apache.datawise.backend.jdbc.support;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MigrationWhereSupportTest {

    @Test
    void acceptsSimpleWhereClause() {
        MigrationWhereSupport.validate("status = 1");
        assertEquals(
                "SELECT * FROM orders WHERE status = 1",
                MigrationWhereSupport.appendWhere("SELECT * FROM orders", "status = 1")
        );
    }

    @Test
    void acceptsCompoundComparisonWhere() {
        MigrationWhereSupport.validate("created_at >= '2024-01-01' AND status IN (1, 2)");
        String sql = MigrationWhereSupport.appendWhere(
                "SELECT * FROM orders",
                "created_at >= '2024-01-01' AND status IN (1, 2)"
        );
        assertTrue(sql.toLowerCase().contains("where"));
        assertTrue(sql.contains("status"));
    }

    @Test
    void rejectsUnsafeWhereClause() {
        assertThrows(IllegalArgumentException.class, () -> MigrationWhereSupport.validate("1=1; DROP TABLE t"));
        assertThrows(IllegalArgumentException.class, () -> MigrationWhereSupport.validate("id = 1 -- comment"));
        assertThrows(IllegalArgumentException.class, () -> MigrationWhereSupport.validate("id IN (SELECT id FROM t)"));
        assertThrows(IllegalArgumentException.class, () -> MigrationWhereSupport.validate("x = LOAD_FILE('/etc/passwd')"));
        assertThrows(IllegalArgumentException.class, () -> MigrationWhereSupport.validate("EXISTS (SELECT 1)"));
        assertThrows(IllegalArgumentException.class, () -> MigrationWhereSupport.validate("sleep(5) = 0"));
        assertThrows(IllegalArgumentException.class, () -> MigrationWhereSupport.validate("CASE WHEN 1=1 THEN 1 ELSE 0 END = 1"));
    }

    @Test
    void appendWhereFailsClosedOnUnparseableBaseSql() {
        assertThrows(
                IllegalArgumentException.class,
                () -> MigrationWhereSupport.appendWhere("NOT A VALID SQL", "status = 1")
        );
    }

    @Test
    void detectsEqualScopes() {
        assertEquals(true, MigrationWhereSupport.scopesEqual("c1", "db1", "c1", "db1"));
        assertEquals(false, MigrationWhereSupport.scopesEqual("c1", "db1", "c1", "db2"));
    }
}
