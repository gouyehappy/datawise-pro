package org.apache.datawise.backend.jdbc.support;

import javax.sql.DataSource;
import java.io.PrintWriter;
import java.sql.Connection;
import java.sql.Driver;
import java.sql.SQLException;
import java.sql.SQLFeatureNotSupportedException;
import java.util.Properties;
import java.util.logging.Logger;

/**
 * 将 Maven 动态加载的 JDBC 驱动交给 HikariCP；直接使用已加载的 {@link Driver}，避免 Hikari
 * {@code DriverDataSource} 在构造时用应用 ClassLoader 再次加载驱动类。
 */
public final class ClassLoaderDriverDataSource implements DataSource {

    private final Driver driver;
    private final String jdbcUrl;
    private final Properties driverProperties;
    private final ClassLoader driverClassLoader;

    public ClassLoaderDriverDataSource(
            Driver driver,
            String jdbcUrl,
            Properties driverProperties,
            ClassLoader driverClassLoader
    ) {
        this.driver = driver;
        this.jdbcUrl = jdbcUrl;
        this.driverProperties = copyProperties(driverProperties);
        this.driverClassLoader = driverClassLoader;
    }

    @Override
    public Connection getConnection() throws SQLException {
        return withDriverClassLoader(() -> connect(driverProperties));
    }

    @Override
    public Connection getConnection(String username, String password) throws SQLException {
        Properties cloned = copyProperties(driverProperties);
        if (username != null) {
            cloned.setProperty("user", username);
        }
        if (password != null) {
            cloned.setProperty("password", password);
        }
        return withDriverClassLoader(() -> connect(cloned));
    }

    private Connection connect(Properties properties) throws SQLException {
        Connection connection = driver.connect(jdbcUrl, properties);
        if (connection == null) {
            throw new SQLException("Driver rejected URL: " + jdbcUrl);
        }
        return connection;
    }

    private Connection withDriverClassLoader(SqlSupplier supplier) throws SQLException {
        ClassLoader previous = Thread.currentThread().getContextClassLoader();
        try {
            if (driverClassLoader != null) {
                Thread.currentThread().setContextClassLoader(driverClassLoader);
            }
            return supplier.get();
        } finally {
            Thread.currentThread().setContextClassLoader(previous);
        }
    }

    @Override
    public PrintWriter getLogWriter() {
        return null;
    }

    @Override
    public void setLogWriter(PrintWriter out) {
    }

    @Override
    public void setLoginTimeout(int seconds) {
    }

    @Override
    public int getLoginTimeout() {
        return 0;
    }

    @Override
    public Logger getParentLogger() throws SQLFeatureNotSupportedException {
        return driver.getParentLogger();
    }

    @Override
    public <T> T unwrap(Class<T> iface) throws SQLException {
        if (iface.isInstance(driver)) {
            return iface.cast(driver);
        }
        throw new SQLException("Cannot unwrap to " + iface.getName());
    }

    @Override
    public boolean isWrapperFor(Class<?> iface) {
        return iface.isInstance(driver);
    }

    private static Properties copyProperties(Properties source) {
        Properties copy = new Properties();
        if (source != null) {
            copy.putAll(source);
        }
        return copy;
    }

    @FunctionalInterface
    private interface SqlSupplier {
        Connection get() throws SQLException;
    }
}
