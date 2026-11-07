package org.apache.datawise.backend.common;

/**
 * Connection metadata for a {@link DbType}, loaded from {@code db-type-profiles.properties}.
 */
public record DbTypeProfile(
        String quote,
        String displayName,
        String driver,
        int port,
        String sql,
        String urlPrefix,
        String[] url,
        String sample,
        FieldIdeEnum fieldIde,
        DbTypeCatalogEntry catalog) {
}
