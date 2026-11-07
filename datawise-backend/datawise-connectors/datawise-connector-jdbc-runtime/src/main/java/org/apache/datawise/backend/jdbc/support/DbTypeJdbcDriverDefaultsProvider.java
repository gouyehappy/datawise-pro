package org.apache.datawise.backend.jdbc.support;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.common.DbTypeCatalogEntry;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * 从 {@link DbType} 读取默认 JDBC 驱动，不依赖 ConnectorRegistry，避免 Spring 循环依赖。
 */
@Component
public class DbTypeJdbcDriverDefaultsProvider implements JdbcDriverDefaultsProvider {

    private final Map<String, DriverDefaults> defaultsByType;
    private final List<DriverDefaults> allDefaults;

    public DbTypeJdbcDriverDefaultsProvider() {
        this.defaultsByType = loadDefaults();
        this.allDefaults = List.copyOf(uniqueDefaults(defaultsByType.values()));
    }

    @Override
    public Optional<DriverDefaults> defaultsFor(String dbType) {
        if (dbType == null || dbType.isBlank()) {
            return Optional.empty();
        }
        return Optional.ofNullable(defaultsByType.get(dbType.toLowerCase(Locale.ROOT)));
    }

    @Override
    public List<DriverDefaults> allDefaults() {
        return allDefaults;
    }

    private static List<DriverDefaults> uniqueDefaults(Iterable<DriverDefaults> defaults) {
        Set<String> seen = new LinkedHashSet<>();
        List<DriverDefaults> unique = new ArrayList<>();
        for (DriverDefaults item : defaults) {
            String key = item.mavenCoordinates() + "|" + item.driverClass();
            if (seen.add(key)) {
                unique.add(item);
            }
        }
        return unique;
    }

    private static Map<String, DriverDefaults> loadDefaults() {
        Map<String, DriverDefaults> map = new HashMap<>();
        for (DbType type : DbType.catalogListed()) {
            DbTypeCatalogEntry catalog = type.catalogEntry().orElse(null);
            if (catalog == null || !catalog.jdbcDriverRequired()) {
                continue;
            }
            if (catalog.driverMaven() == null || catalog.driverMaven().isBlank()) {
                continue;
            }
            map.put(
                    type.id(),
                    new DriverDefaults(catalog.driverMaven(), catalog.resolveDriverClass(type))
            );
        }
        return Map.copyOf(map);
    }
}
