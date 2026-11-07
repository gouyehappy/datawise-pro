package org.apache.datawise.backend.jdbc.support;

import org.apache.datawise.backend.config.JdbcPoolProperties;
import org.apache.datawise.backend.model.ConnectionEntity;

/**
 * Resolves per-connection pool sizing from {@code advancedConfig} lines such as
 * {@code jdbc.maximumPoolSize=16}.
 */
public final class JdbcPoolSizeResolver {

    private static final String MAX_POOL_KEY = "jdbc.maximumPoolSize";
    private static final String MIN_IDLE_KEY = "jdbc.minimumIdle";
    /** Upper bound for per-connection pool overrides from advancedConfig. */
    public static final int MAXIMUM_POOL_SIZE_CAP = 50;

    private JdbcPoolSizeResolver() {
    }

    public static int resolveMaximumPoolSize(ConnectionEntity entity, JdbcPoolProperties defaults) {
        JdbcPoolProperties base = defaults != null ? defaults : new JdbcPoolProperties();
        Integer override = readIntProperty(entity != null ? entity.getAdvancedConfig() : null, MAX_POOL_KEY);
        if (override == null) {
            return Math.min(base.getMaximumPoolSize(), MAXIMUM_POOL_SIZE_CAP);
        }
        return Math.min(Math.max(1, override), MAXIMUM_POOL_SIZE_CAP);
    }

    public static int resolveMinimumIdle(ConnectionEntity entity, JdbcPoolProperties defaults, int maximumPoolSize) {
        JdbcPoolProperties base = defaults != null ? defaults : new JdbcPoolProperties();
        Integer override = readIntProperty(entity != null ? entity.getAdvancedConfig() : null, MIN_IDLE_KEY);
        int minimumIdle = override != null ? override : base.getMinimumIdle();
        return Math.min(Math.max(0, minimumIdle), Math.max(1, maximumPoolSize));
    }

    static Integer readIntProperty(String advancedConfig, String key) {
        if (advancedConfig == null || advancedConfig.isBlank() || key == null || key.isBlank()) {
            return null;
        }
        for (String line : advancedConfig.split("\\R")) {
            String trimmed = line.trim();
            if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                continue;
            }
            int separator = trimmed.indexOf('=');
            if (separator <= 0) {
                continue;
            }
            String propertyKey = trimmed.substring(0, separator).trim();
            if (!key.equalsIgnoreCase(propertyKey)) {
                continue;
            }
            String value = trimmed.substring(separator + 1).trim();
            if (value.isEmpty()) {
                return null;
            }
            try {
                return Integer.parseInt(value);
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }
}
