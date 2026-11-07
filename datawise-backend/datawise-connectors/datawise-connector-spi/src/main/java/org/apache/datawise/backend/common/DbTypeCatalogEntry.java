package org.apache.datawise.backend.common;

/**
 * Catalog-visible datasource metadata and default JDBC driver Maven coordinates.
 * Only types listed in the connection picker define a non-null entry.
 */
public record DbTypeCatalogEntry(
        boolean primary,
        boolean jdbcDriverRequired,
        String driverMaven,
        String defaultDriverClassOverride) {

    /** JDBC datasource with default driver from {@link DbType#getDriver()}. */
    public static DbTypeCatalogEntry jdbc(boolean primary, String driverMaven) {
        return new DbTypeCatalogEntry(primary, true, driverMaven, null);
    }

    /** JDBC datasource with explicit default driver class override. */
    public static DbTypeCatalogEntry jdbc(boolean primary, String driverMaven, String driverClassOverride) {
        return new DbTypeCatalogEntry(primary, true, driverMaven, driverClassOverride);
    }

    /** JDBC datasource without bundled default driver (user supplies Maven coords + class). */
    public static DbTypeCatalogEntry jdbcCustom(boolean primary) {
        return new DbTypeCatalogEntry(primary, true, null, null);
    }

    /** Non-JDBC datasource (e.g. Redis). */
    public static DbTypeCatalogEntry nonJdbc(boolean primary) {
        return new DbTypeCatalogEntry(primary, false, null, null);
    }

    /** Resolves default JDBC driver class; uses override when configured. */
    public String resolveDriverClass(DbType type) {
        if (defaultDriverClassOverride != null && !defaultDriverClassOverride.isBlank()) {
            return defaultDriverClassOverride;
        }
        return type.getDriver();
    }
}
