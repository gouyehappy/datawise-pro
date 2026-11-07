package org.apache.datawise.backend.ops;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.ConnectorPluginContributionHolder;
import org.apache.datawise.backend.domain.ActiveSessionDto;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.domain.LockWaitEdgeDto;
import org.apache.datawise.backend.ops.spi.ActiveSessionOps;
import org.apache.datawise.backend.ops.spi.LockWaitOps;
import org.apache.datawise.backend.ops.spi.SessionKillOps;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DatabaseOpsRegistryTest {

    private final DatabaseOpsRegistry registry = new DatabaseOpsRegistry(
            List.of(new FakeMysqlActiveSessionOps(), new FakePostgresqlDatabaseOps(), new FakeSqlServerDatabaseOps()),
            List.of(new FakeMysqlLockWaitOps(), new FakePostgresqlDatabaseOps(), new FakeSqlServerDatabaseOps()),
            List.of(new FakeMysqlSessionKillOps(), new FakePostgresqlDatabaseOps(), new FakeSqlServerDatabaseOps()),
            new ConnectorPluginContributionHolder());

    @Test
    void resolvesActiveSessionOpsForSupportedFamilies() {
        assertTrue(registry.supportsActiveSession("mysql"));
        assertTrue(registry.supportsActiveSession("postgresql"));
        assertTrue(registry.supportsActiveSession("sqlserver"));
        assertFalse(registry.supportsActiveSession("redis"));

        assertEquals("mysql-family", registry.findActiveSession("mysql").orElseThrow().dialectId());
        assertEquals("postgresql", registry.findActiveSession("kingbase").orElseThrow().dialectId());
    }

    @Test
    void resolvesLockWaitOpsForSupportedFamilies() {
        assertTrue(registry.supportsLockWait("mysql"));
        assertTrue(registry.supportsLockWait("postgresql"));
        assertFalse(registry.supportsLockWait("redis"));

        assertEquals("mysql-family", registry.findLockWait("mysql").orElseThrow().dialectId());
    }

    @Test
    void resolvesSessionKillOpsForSupportedFamilies() {
        assertTrue(registry.supportsSessionKill("mysql"));
        assertTrue(registry.supportsSessionKill("postgresql"));
        assertFalse(registry.supportsSessionKill("redis"));

        assertEquals(
                "KILL QUERY 456",
                registry.findSessionKill("mysql").orElseThrow().buildKillSql("456", "query"));
        assertEquals(
                "SELECT pg_cancel_backend(123)",
                registry.findSessionKill("postgresql").orElseThrow().buildKillSql("123", "query"));
        assertEquals(
                "KILL 99",
                registry.findSessionKill("sqlserver").orElseThrow().buildKillSql("99", "connection"));
    }

    private static final class FakeSqlServerDatabaseOps implements ActiveSessionOps, LockWaitOps, SessionKillOps {

        @Override
        public String dialectId() {
            return "sqlserver";
        }

        @Override
        public boolean supports(String dbType) {
            return DbType.isSqlServerFamily(dbType);
        }

        @Override
        public int priority() {
            return 22;
        }

        @Override
        public String buildQuery() {
            return "SELECT 1";
        }

        @Override
        public String buildSelfSessionIdQuery() {
            return "SELECT @@SPID";
        }

        @Override
        public List<ActiveSessionDto> parseSessions(ExecuteSqlResult result, String excludeSessionId) {
            return List.of();
        }

        @Override
        public String readSelfSessionId(ExecuteSqlResult result) {
            return null;
        }

        @Override
        public String buildQuery(boolean mysqlLegacy) {
            return "SELECT 1";
        }

        @Override
        public List<LockWaitEdgeDto> parseEdges(ExecuteSqlResult result) {
            return List.of();
        }

        @Override
        public String buildKillSql(String sessionId, String mode) {
            SessionKillOps.validateSessionId(sessionId);
            return "KILL " + sessionId.trim();
        }
    }

    private static final class FakeMysqlActiveSessionOps implements ActiveSessionOps {

        @Override
        public String dialectId() {
            return "mysql-family";
        }

        @Override
        public boolean supports(String dbType) {
            return DbType.isMysqlProtocol(dbType);
        }

        @Override
        public int priority() {
            return 20;
        }

        @Override
        public String buildQuery() {
            return "SHOW FULL PROCESSLIST";
        }

        @Override
        public String buildSelfSessionIdQuery() {
            return "SELECT CONNECTION_ID()";
        }

        @Override
        public List<ActiveSessionDto> parseSessions(ExecuteSqlResult result, String excludeSessionId) {
            return List.of();
        }

        @Override
        public String readSelfSessionId(ExecuteSqlResult result) {
            return null;
        }
    }

    private static final class FakeMysqlLockWaitOps implements LockWaitOps {

        @Override
        public String dialectId() {
            return "mysql-family";
        }

        @Override
        public boolean supports(String dbType) {
            return DbType.isMysqlFamily(dbType);
        }

        @Override
        public int priority() {
            return 20;
        }

        @Override
        public String buildQuery(boolean mysqlLegacy) {
            return mysqlLegacy ? "legacy" : "modern";
        }

        @Override
        public List<LockWaitEdgeDto> parseEdges(ExecuteSqlResult result) {
            return List.of();
        }
    }

    private static final class FakeMysqlSessionKillOps implements SessionKillOps {

        @Override
        public String dialectId() {
            return "mysql-family";
        }

        @Override
        public boolean supports(String dbType) {
            return DbType.isMysqlProtocol(dbType);
        }

        @Override
        public int priority() {
            return 20;
        }

        @Override
        public String buildKillSql(String sessionId, String mode) {
            SessionKillOps.validateSessionId(sessionId);
            return SessionKillOps.MODE_CONNECTION.equals(SessionKillOps.normalizeMode(mode))
                    ? "KILL " + sessionId.trim()
                    : "KILL QUERY " + sessionId.trim();
        }
    }

    private static final class FakePostgresqlDatabaseOps implements ActiveSessionOps, LockWaitOps, SessionKillOps {

        @Override
        public String dialectId() {
            return "postgresql";
        }

        @Override
        public boolean supports(String dbType) {
            return DbType.isPostgresqlFamily(dbType);
        }

        @Override
        public int priority() {
            return 21;
        }

        @Override
        public String buildQuery() {
            return "SELECT 1";
        }

        @Override
        public String buildSelfSessionIdQuery() {
            return "SELECT pg_backend_pid()";
        }

        @Override
        public List<ActiveSessionDto> parseSessions(ExecuteSqlResult result, String excludeSessionId) {
            return List.of();
        }

        @Override
        public String readSelfSessionId(ExecuteSqlResult result) {
            return null;
        }

        @Override
        public String buildQuery(boolean mysqlLegacy) {
            return "SELECT 1";
        }

        @Override
        public List<LockWaitEdgeDto> parseEdges(ExecuteSqlResult result) {
            return List.of();
        }

        @Override
        public String buildKillSql(String sessionId, String mode) {
            SessionKillOps.validateSessionId(sessionId);
            return SessionKillOps.MODE_CONNECTION.equals(SessionKillOps.normalizeMode(mode))
                    ? "SELECT pg_terminate_backend(" + sessionId.trim() + ")"
                    : "SELECT pg_cancel_backend(" + sessionId.trim() + ")";
        }
    }
}
