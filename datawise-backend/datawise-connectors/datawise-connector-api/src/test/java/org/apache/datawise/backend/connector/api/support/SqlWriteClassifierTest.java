package org.apache.datawise.backend.connector.api.support;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SqlWriteClassifierTest {

    @Test
    void treatsSelectAsReadOnly() {
        assertFalse(SqlWriteClassifier.requiresWriteAccess("SELECT * FROM users"));
        assertFalse(SqlWriteClassifier.requiresWriteAccess("WITH cte AS (SELECT 1) SELECT * FROM cte"));
        assertFalse(SqlWriteClassifier.requiresWriteAccess("EXPLAIN SELECT 1"));
    }

    @Test
    void treatsSelectSideEffectsAsWrite() {
        assertTrue(SqlWriteClassifier.requiresWriteAccess("SELECT * FROM t INTO OUTFILE '/tmp/x'"));
        assertTrue(SqlWriteClassifier.requiresWriteAccess("SELECT * FROM t FOR UPDATE"));
        assertTrue(SqlWriteClassifier.requiresWriteAccess("SELECT LOAD_FILE('/etc/passwd')"));
        assertTrue(SqlWriteClassifier.requiresWriteAccess("COPY t TO STDOUT"));
        assertTrue(SqlWriteClassifier.requiresWriteAccess("COPY t FROM STDIN"));
    }

    @Test
    void treatsDmlAndDdlAsWrite() {
        assertTrue(SqlWriteClassifier.requiresWriteAccess("INSERT INTO t VALUES (1)"));
        assertTrue(SqlWriteClassifier.requiresWriteAccess("UPDATE t SET a = 1"));
        assertTrue(SqlWriteClassifier.requiresWriteAccess("DELETE FROM t"));
        assertTrue(SqlWriteClassifier.requiresWriteAccess("CREATE TABLE t (id INT)"));
        assertTrue(SqlWriteClassifier.requiresWriteAccess("LOAD DATA INFILE '/tmp/x' INTO TABLE t"));
        assertTrue(SqlWriteClassifier.requiresWriteAccess("REFRESH MATERIALIZED VIEW v"));
    }

    @Test
    void treatsTransactionControlAsWrite() {
        assertTrue(SqlWriteClassifier.requiresWriteAccess("BEGIN"));
        assertTrue(SqlWriteClassifier.requiresWriteAccess("COMMIT"));
        assertTrue(SqlWriteClassifier.requiresWriteAccess("ROLLBACK"));
    }

    @Test
    void classifiesDdlStatements() {
        assertTrue(SqlWriteClassifier.requiresDdlAccess("CREATE TABLE t (id INT)"));
        assertTrue(SqlWriteClassifier.requiresDdlAccess("ALTER TABLE t ADD COLUMN x INT"));
        assertTrue(SqlWriteClassifier.requiresDdlAccess("DROP TABLE t"));
        assertFalse(SqlWriteClassifier.requiresDdlAccess("UPDATE t SET a = 1"));
        assertFalse(SqlWriteClassifier.requiresDdlAccess("INSERT INTO t VALUES (1)"));
    }

    @Test
    void classifiesDangerousSqlForConfirmation() {
        assertTrue(SqlWriteClassifier.requiresDangerousSqlConfirmation("DELETE FROM t"));
        assertTrue(SqlWriteClassifier.requiresDangerousSqlConfirmation("UPDATE t SET a = 1"));
        assertTrue(SqlWriteClassifier.requiresDangerousSqlConfirmation("TRUNCATE TABLE t"));
        assertTrue(SqlWriteClassifier.requiresDangerousSqlConfirmation("DROP TABLE t"));
        assertFalse(SqlWriteClassifier.requiresDangerousSqlConfirmation("INSERT INTO t VALUES (1)"));
        assertFalse(SqlWriteClassifier.requiresDangerousSqlConfirmation("CREATE TABLE t (id INT)"));
        assertFalse(SqlWriteClassifier.requiresDangerousSqlConfirmation("SELECT * FROM t"));
    }

    @Test
    void blocksMysqlExecutableCommentBypass() {
        assertTrue(SqlWriteClassifier.requiresWriteAccess("/*!50000 DELETE FROM t */"));
        assertTrue(SqlWriteClassifier.requiresWriteAccess("SELECT 1 /*!50000 ; DELETE FROM t */"));
        assertTrue(SqlWriteClassifier.requiresWriteAccess("/*! UPDATE t SET a = 1 */"));
    }

    @Test
    void blocksMultiStatementWriteAfterSelect() {
        assertTrue(SqlWriteClassifier.requiresWriteAccess("SELECT 1; DELETE FROM t"));
        assertTrue(SqlWriteClassifier.requiresWriteAccess("SELECT 1;\nUPDATE t SET a = 1"));
        assertTrue(SqlWriteClassifier.requiresDangerousSqlConfirmation("SELECT 1; DROP TABLE t"));
    }

    @Test
    void blocksCteWriteStatements() {
        assertTrue(SqlWriteClassifier.requiresWriteAccess("WITH x AS (SELECT 1) DELETE FROM t"));
        assertTrue(SqlWriteClassifier.requiresWriteAccess("WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x"));
        assertTrue(SqlWriteClassifier.requiresDangerousSqlConfirmation("WITH x AS (SELECT 1) DELETE FROM t"));
        assertTrue(SqlWriteClassifier.requiresDangerousSqlConfirmation("WITH x AS (SELECT 1) DROP TABLE t"));
        assertFalse(SqlWriteClassifier.requiresDangerousSqlConfirmation("WITH x AS (SELECT 1) SELECT * FROM x"));
    }
}
