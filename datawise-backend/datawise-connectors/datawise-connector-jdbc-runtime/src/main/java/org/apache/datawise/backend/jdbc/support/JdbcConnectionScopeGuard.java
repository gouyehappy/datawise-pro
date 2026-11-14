package org.apache.datawise.backend.jdbc.support;

import org.apache.datawise.backend.common.DbType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Restores a pooled connection's database context when the caller closes it.
 *
 * <p>{@code USE [db]} — and {@code Connection#setCatalog} on most drivers — change state that
 * HikariCP does not reset on release. A metadata lookup that switches database therefore hands
 * the pool a connection still pointing at that database, and the next caller that omits an
 * explicit {@code database} silently reads from the wrong one. SQL Server makes this worse:
 * {@link Connection#getCatalog()} does not track {@code USE}, so the driver cannot tell the
 * caller what happened.
 *
 * <p>The guard is installed once per borrow. Scope switchers record the catalog that was active
 * <em>before</em> they switch, and the recorded value is restored just before the connection goes
 * back to the pool.
 */
public final class JdbcConnectionScopeGuard {

    private static final Logger log = LoggerFactory.getLogger(JdbcConnectionScopeGuard.class);

    /** Implemented by the returned proxy so scope switchers can record the pre-switch catalog. */
    public interface ScopedConnection {

        /**
         * Records the catalog to restore on close. Only the first call wins, so nested switches
         * unwind to the catalog the connection had before any of them.
         */
        void markScoped(String previousCatalog);
    }

    private JdbcConnectionScopeGuard() {
    }

    /**
     * Wraps a borrowed connection. Returns the argument unchanged when it is already guarded, so
     * repeated wrapping cannot stack restores.
     */
    public static Connection wrap(Connection delegate, String dbType) {
        if (delegate == null || delegate instanceof ScopedConnection) {
            return delegate;
        }
        return (Connection) Proxy.newProxyInstance(
                JdbcConnectionScopeGuard.class.getClassLoader(),
                new Class<?>[]{Connection.class, ScopedConnection.class},
                new Handler(delegate, DbType.normalizeId(dbType), readCatalogQuietly(delegate)));
    }

    /** Catalog the connection was borrowed with; the fallback baseline for drivers that track it. */
    private static String readCatalogQuietly(Connection connection) {
        try {
            String catalog = connection.getCatalog();
            return catalog == null || catalog.isBlank() ? null : catalog.trim();
        } catch (SQLException ignored) {
            return null;
        }
    }

    private static final class Handler implements InvocationHandler, ScopedConnection {

        private final Connection delegate;
        private final String dbType;
        private final String baselineCatalog;
        private final AtomicBoolean closed = new AtomicBoolean();
        private String previousCatalog;

        private Handler(Connection delegate, String dbType, String baselineCatalog) {
            this.delegate = delegate;
            this.dbType = dbType;
            this.baselineCatalog = baselineCatalog;
        }

        @Override
        public synchronized void markScoped(String previousCatalog) {
            if (previousCatalog == null || previousCatalog.isBlank()) {
                return;
            }
            // First writer wins: the outermost switch owns the baseline.
            if (this.previousCatalog == null) {
                this.previousCatalog = previousCatalog.trim();
            }
        }

        @Override
        public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
            String name = method.getName();
            if ("markScoped".equals(name)) {
                markScoped((String) args[0]);
                return null;
            }
            if ("close".equals(name)) {
                if (closed.compareAndSet(false, true)) {
                    restore();
                }
                return invokeDelegate(method, args);
            }
            if ("equals".equals(name)) {
                return proxy == args[0];
            }
            if ("hashCode".equals(name)) {
                return System.identityHashCode(proxy);
            }
            if ("toString".equals(name)) {
                return "ScopedConnection[" + delegate + "]";
            }
            return invokeDelegate(method, args);
        }

        private Object invokeDelegate(Method method, Object[] args) throws Throwable {
            try {
                return method.invoke(delegate, args);
            } catch (InvocationTargetException ex) {
                throw ex.getCause() != null ? ex.getCause() : ex;
            }
        }

        private void restore() {
            String marked;
            String baseline;
            synchronized (this) {
                marked = previousCatalog;
                baseline = baselineCatalog;
                previousCatalog = null;
            }
            String target = marked != null ? marked : baseline;
            if (target == null) {
                return;
            }
            try {
                if (delegate.isClosed()) {
                    return;
                }
                // An explicit transaction owns the session; the pool resets it when the user is done.
                if (!delegate.getAutoCommit()) {
                    return;
                }
                if (DbType.isSqlServerFamily(dbType)) {
                    // Only applyCatalog switches a SQL Server session, and it always marks first,
                    // so an unmarked connection never moved and needs no USE.
                    if (marked == null) {
                        return;
                    }
                    try (Statement statement = delegate.createStatement()) {
                        statement.execute("USE " + DbType.SQLSERVER.quoteName(marked));
                    }
                    return;
                }
                if (!Objects.equals(target, delegate.getCatalog())) {
                    delegate.setCatalog(target);
                }
            } catch (SQLException ex) {
                // Best effort: a failed reset must never break the caller's close().
                log.debug("Failed to restore JDBC connection catalog to {}; releasing as-is", target, ex);
            }
        }
    }
}
