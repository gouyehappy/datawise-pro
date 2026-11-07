package org.apache.datawise.backend.schema;

import java.util.Locale;
import java.util.Set;

/** JDBC catalog names that are engine-internal and should not appear in the explorer tree. */
public final class SystemCatalogNames {

    public static final Set<String> MYSQL_PROTOCOL = Set.of(
            "information_schema",
            "mysql",
            "performance_schema",
            "sys");

    private SystemCatalogNames() {
    }

    public static boolean isMysqlProtocolSystemCatalog(String catalog) {
        return isNamed(catalog, MYSQL_PROTOCOL);
    }

    public static boolean isNamed(String catalog, Set<String> names) {
        return catalog != null && names.contains(catalog.toLowerCase(Locale.ROOT));
    }
}
