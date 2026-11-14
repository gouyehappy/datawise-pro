package org.apache.datawise.backend.jdbc.support;

import org.junit.jupiter.api.Test;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Pins the contract that a pooled connection goes back to the pool with the catalog it was
 * borrowed with, no matter which metadata lookup switched it.
 */
class JdbcConnectionScopeGuardTest {

    @Test
    void closeRestoresCatalogChangedThroughSetCatalog() throws SQLException {
        FakeConnection fake = new FakeConnection("sales");
        Connection connection = JdbcConnectionScopeGuard.wrap(fake.proxy(), "postgresql");

        connection.setCatalog("archive");
        assertEquals("archive", fake.catalog);

        connection.close();

        assertEquals("sales", fake.catalog);
        assertEquals(1, fake.closeCount);
    }

    @Test
    void closeRestoresSqlServerCatalogThroughUse() throws SQLException {
        FakeConnection fake = new FakeConnection("sales");
        Connection connection = JdbcConnectionScopeGuard.wrap(fake.proxy(), "sqlserver");

        SqlServerCatalogSupport.applyCatalog(connection, "archive");
        assertEquals("archive", fake.catalog);

        connection.close();

        assertEquals("sales", fake.catalog, "USE [sales] must run before the connection is released");
        assertTrue(fake.executed.stream().anyMatch(sql -> sql.contains("USE ") && sql.contains("sales")));
    }

    @Test
    void nestedSwitchesUnwindToTheOriginalCatalog() throws SQLException {
        FakeConnection fake = new FakeConnection("sales");
        Connection connection = JdbcConnectionScopeGuard.wrap(fake.proxy(), "sqlserver");

        ((JdbcConnectionScopeGuard.ScopedConnection) connection).markScoped("sales");
        fake.catalog = "archive";
        ((JdbcConnectionScopeGuard.ScopedConnection) connection).markScoped("archive");

        connection.close();

        assertEquals("sales", fake.catalog, "the first mark wins, not the most recent one");
    }

    @Test
    void untouchedConnectionIsNotRewritten() throws SQLException {
        FakeConnection fake = new FakeConnection("sales");
        Connection connection = JdbcConnectionScopeGuard.wrap(fake.proxy(), "postgresql");

        connection.close();

        assertEquals(0, fake.setCatalogCalls);
        assertTrue(fake.executed.isEmpty(), "no restore statement should be issued when nothing changed");
    }

    @Test
    void switchInsideTransactionIsLeftToThePool() throws SQLException {
        FakeConnection fake = new FakeConnection("sales");
        fake.autoCommit = false;
        Connection connection = JdbcConnectionScopeGuard.wrap(fake.proxy(), "sqlserver");

        SqlServerCatalogSupport.applyCatalog(connection, "archive");
        connection.close();

        assertEquals("archive", fake.catalog, "an explicit session owns the connection; do not fight it");
    }

    @Test
    void restoreFailureDoesNotBreakClose() throws SQLException {
        FakeConnection fake = new FakeConnection("sales");
        Connection connection = JdbcConnectionScopeGuard.wrap(fake.proxy(), "sqlserver");

        SqlServerCatalogSupport.applyCatalog(connection, "archive");
        // The reset itself is what fails; the switch already happened.
        fake.failOnRestore = true;
        connection.close();

        assertTrue(fake.closed);
        assertEquals(1, fake.closeCount);
    }

    @Test
    void wrappingTwiceIsANoOp() {
        FakeConnection fake = new FakeConnection("sales");
        Connection once = JdbcConnectionScopeGuard.wrap(fake.proxy(), "postgresql");

        assertEquals(once, JdbcConnectionScopeGuard.wrap(once, "postgresql"));
    }

    @Test
    void driverExceptionsSurfaceUnwrapped() {
        FakeConnection fake = new FakeConnection("sales");
        fake.failOnCommit = true;
        Connection connection = JdbcConnectionScopeGuard.wrap(fake.proxy(), "postgresql");

        SQLException thrown = org.junit.jupiter.api.Assertions.assertThrows(
                SQLException.class,
                connection::commit);
        assertEquals("commit rejected", thrown.getMessage());
    }

    /** Minimal JDBC connection fake: tracks catalog, executed SQL and close calls. */
    private static final class FakeConnection implements InvocationHandler {

        private String catalog;
        private boolean autoCommit = true;
        private boolean closed;
        private int closeCount;
        private int setCatalogCalls;
        private boolean failOnRestore;
        private boolean failOnCommit;
        private final List<String> executed = new ArrayList<>();

        private FakeConnection(String catalog) {
            this.catalog = catalog;
        }

        private Connection proxy() {
            return (Connection) Proxy.newProxyInstance(
                    JdbcConnectionScopeGuardTest.class.getClassLoader(),
                    new Class<?>[]{Connection.class},
                    this);
        }

        @Override
        public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
            switch (method.getName()) {
                case "getCatalog":
                    return catalog;
                case "setCatalog":
                    if (failOnRestore) {
                        throw new SQLException("catalog unavailable");
                    }
                    catalog = (String) args[0];
                    setCatalogCalls++;
                    return null;
                case "isClosed":
                    return closed;
                case "close":
                    closed = true;
                    closeCount++;
                    return null;
                case "getAutoCommit":
                    return autoCommit;
                case "setAutoCommit":
                    autoCommit = (Boolean) args[0];
                    return null;
                case "commit":
                    if (failOnCommit) {
                        throw new SQLException("commit rejected");
                    }
                    return null;
                case "createStatement":
                    return statement();
                case "equals":
                    return proxy == args[0];
                case "hashCode":
                    return System.identityHashCode(proxy);
                case "toString":
                    return "FakeConnection[" + catalog + "]";
                default:
                    throw new UnsupportedOperationException("unexpected JDBC call: " + method.getName());
            }
        }

        private Statement statement() {
            return (Statement) Proxy.newProxyInstance(
                    JdbcConnectionScopeGuardTest.class.getClassLoader(),
                    new Class<?>[]{Statement.class},
                    (proxy, method, args) -> {
                        switch (method.getName()) {
                            case "execute":
                                String sql = (String) args[0];
                                executed.add(sql);
                                if (failOnRestore && sql.startsWith("USE ")) {
                                    throw new SQLException("USE rejected");
                                }
                                // USE [x] is the only state-changing statement the guard issues.
                                if (sql.startsWith("USE [") && sql.endsWith("]")) {
                                    catalog = sql.substring(5, sql.length() - 1);
                                }
                                return true;
                            case "executeQuery":
                                if (String.valueOf(args[0]).contains("DB_NAME()")) {
                                    return singleValue(catalog);
                                }
                                throw new SQLException("unexpected query: " + args[0]);
                            case "close":
                                return null;
                            case "isClosed":
                                return false;
                            case "toString":
                                return "FakeStatement";
                            default:
                                throw new UnsupportedOperationException(
                                        "unexpected statement call: " + method.getName());
                        }
                    });
        }

        private ResultSet singleValue(String value) {
            boolean[] consumed = {false};
            return (ResultSet) Proxy.newProxyInstance(
                    JdbcConnectionScopeGuardTest.class.getClassLoader(),
                    new Class<?>[]{ResultSet.class},
                    (proxy, method, args) -> {
                        switch (method.getName()) {
                            case "next":
                                if (consumed[0]) {
                                    return false;
                                }
                                consumed[0] = true;
                                return true;
                            case "getString":
                                return value;
                            case "close":
                                return null;
                            case "toString":
                                return "FakeResultSet";
                            default:
                                throw new UnsupportedOperationException(
                                        "unexpected result set call: " + method.getName());
                        }
                    });
        }
    }
}
