package org.apache.datawise.backend.common;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;

final class DbTypeProfiles {

    private static final String RESOURCE = "db-type-profiles.properties";

    private DbTypeProfiles() {
    }

    static Map<DbType, DbTypeProfile> load() {
        Properties properties = new Properties();
        try (InputStream in = DbTypeProfiles.class.getClassLoader().getResourceAsStream(RESOURCE)) {
            if (in == null) {
                throw new IllegalStateException("Missing classpath resource: " + RESOURCE);
            }
            properties.load(in);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to load " + RESOURCE, e);
        }

        Map<DbType, DbTypeProfile> profiles = new EnumMap<>(DbType.class);
        for (DbType type : DbType.values()) {
            String id = type.id();
            if (!hasProfile(id, properties)) {
                throw new IllegalStateException("Missing profile for DbType." + type.name() + " (expected keys prefixed with " + id + ".)");
            }
            profiles.put(type, parseProfile(id, properties));
        }
        return Map.copyOf(profiles);
    }

    private static boolean hasProfile(String id, Properties properties) {
        return properties.containsKey(id + ".displayName");
    }

    private static DbTypeProfile parseProfile(String id, Properties properties) {
        String quote = property(id, "quote", properties);
        String displayName = required(id, "displayName", properties);
        String driver = property(id, "driver", properties);
        int port = Integer.parseInt(required(id, "port", properties));
        String sql = property(id, "sql", properties);
        String urlPrefix = property(id, "urlPrefix", properties);
        String[] url = parseUrls(id, properties);
        String sample = property(id, "sample", properties);
        FieldIdeEnum fieldIde = FieldIdeEnum.parse(required(id, "fieldIde", properties));
        DbTypeCatalogEntry catalog = parseCatalog(id, properties);
        return new DbTypeProfile(quote, displayName, driver, port, sql, urlPrefix, url, sample, fieldIde, catalog);
    }

    private static String[] parseUrls(String id, Properties properties) {
        List<String> urls = new ArrayList<>();
        for (int i = 0;; i++) {
            String key = id + ".url." + i;
            if (!properties.containsKey(key)) {
                break;
            }
            urls.add(properties.getProperty(key, ""));
        }
        if (!urls.isEmpty()) {
            return urls.toArray(String[]::new);
        }
        if (properties.containsKey(id + ".url")) {
            return new String[]{properties.getProperty(id + ".url", "")};
        }
        return new String[0];
    }

    private static DbTypeCatalogEntry parseCatalog(String id, Properties properties) {
        String kind = property(id, "catalog.kind", properties);
        if (kind.isEmpty()) {
            kind = "jdbc";
        }
        boolean primary = Boolean.parseBoolean(required(id, "catalog.primary", properties));
        boolean jdbcDriverRequired = properties.containsKey(id + ".catalog.jdbcDriverRequired")
                ? Boolean.parseBoolean(required(id, "catalog.jdbcDriverRequired", properties))
                : !"nonJdbc".equals(kind);
        String driverMaven = blankToNull(property(id, "catalog.driverMaven", properties));
        String driverClassOverride = blankToNull(property(id, "catalog.defaultDriverClassOverride", properties));

        return switch (kind) {
            case "jdbcCustom" -> DbTypeCatalogEntry.jdbcCustom(primary);
            case "nonJdbc" -> DbTypeCatalogEntry.nonJdbc(primary);
            case "jdbc" -> driverClassOverride != null
                    ? DbTypeCatalogEntry.jdbc(primary, driverMaven, driverClassOverride)
                    : DbTypeCatalogEntry.jdbc(primary, driverMaven);
            default -> throw new IllegalStateException(
                    "Unknown catalog.kind for " + id + ": " + kind + " (expected jdbc, jdbcCustom, or nonJdbc)");
        };
    }

    private static String required(String id, String suffix, Properties properties) {
        String key = id + "." + suffix;
        if (!properties.containsKey(key)) {
            throw new IllegalStateException("Missing property: " + key);
        }
        return properties.getProperty(key, "");
    }

    private static String property(String id, String suffix, Properties properties) {
        return properties.getProperty(id + "." + suffix, "");
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
