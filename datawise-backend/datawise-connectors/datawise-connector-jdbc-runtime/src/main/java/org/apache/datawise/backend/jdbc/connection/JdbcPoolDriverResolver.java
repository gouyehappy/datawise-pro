package org.apache.datawise.backend.jdbc.connection;

import org.apache.datawise.backend.jdbc.support.JdbcDriverDefaultsProvider;
import org.apache.datawise.backend.jdbc.support.JdbcDriverLoader;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.sql.SQLException;
import java.util.Locale;
import java.util.Properties;
import java.util.Set;

/**
 * Resolves JDBC driver coordinates and connection properties for pool/direct open paths.
 */
public final class JdbcPoolDriverResolver {

    private static final Set<String> URL_SESSION_KEYS = Set.of(
            "auth", "ssl", "transportmode", "httppath", "ssltruststore", "truststorepassword",
            "ssltruststorepwd", "authmech", "user", "password"
    );

    private JdbcPoolDriverResolver() {
    }

    public record ResolvedDriver(String mavenCoordinates, String driverClass) {
    }

    /** Builds JDBC {@link Properties} from connection auth settings and optional advanced config. */
    public static Properties buildConnectionProperties(ConnectionEntity entity) {
        Properties properties = new Properties();
        applyAdvancedConfig(properties, entity != null ? entity.getAdvancedConfig() : null);
        if (entity == null) {
            return properties;
        }
        String jdbcUrl = JdbcUrlBuilder.buildJdbcUrl(entity);
        if (Hive2JdbcUrlSupport.credentialsInUrl(entity, jdbcUrl)) {
            return properties;
        }
        if (entity.getAuthType() != null && "NONE".equalsIgnoreCase(entity.getAuthType())) {
            return properties;
        }
        if (entity.getUsername() != null && !entity.getUsername().isBlank()) {
            properties.setProperty("user", entity.getUsername());
        }
        if (entity.getPassword() != null) {
            properties.setProperty("password", entity.getPassword());
        }
        return properties;
    }

    private static void applyAdvancedConfig(Properties properties, String advancedConfig) {
        if (advancedConfig == null || advancedConfig.isBlank()) {
            return;
        }
        for (String line : advancedConfig.split("\\R")) {
            if (line == null) {
                continue;
            }
            String trimmed = line.trim();
            if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                continue;
            }
            int separator = trimmed.indexOf('=');
            if (separator <= 0 || separator >= trimmed.length() - 1) {
                continue;
            }
            String key = trimmed.substring(0, separator).trim();
            String value = trimmed.substring(separator + 1).trim();
            if (URL_SESSION_KEYS.contains(key.toLowerCase(Locale.ROOT))) {
                continue;
            }
            properties.setProperty(key, value);
        }
    }

    /**
     * Resolves Maven coordinates and driver class from entity fields or dbType defaults.
     *
     * @return null when no driver is configured and no default exists for dbType
     */
    public static ResolvedDriver resolve(
            ConnectionEntity entity,
            JdbcDriverDefaultsProvider defaultsProvider
    ) throws SQLException {
        String mavenCoordinates = resolveDriverMaven(entity.getDriver());
        String driverClass = entity.getDriverClass();
        if (mavenCoordinates == null) {
            JdbcDriverDefaultsProvider.DriverDefaults defaults = defaultsProvider
                    .defaultsFor(entity.getDbType())
                    .orElse(null);
            if (defaults == null) {
                return null;
            }
            mavenCoordinates = defaults.mavenCoordinates();
            if (driverClass == null || driverClass.isBlank()) {
                driverClass = defaults.driverClass();
            }
        }
        if (mavenCoordinates == null || mavenCoordinates.isBlank()) {
            return null;
        }
        if (driverClass == null || driverClass.isBlank()) {
            throw new SQLException("driverClass is required when driver Maven coordinates are configured");
        }
        return new ResolvedDriver(mavenCoordinates.trim(), driverClass.trim());
    }

    private static String resolveDriverMaven(String driver) {
        if (driver == null || driver.isBlank()) {
            return null;
        }
        try {
            return JdbcDriverLoader.normalizeDriverInput(driver);
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }
}
