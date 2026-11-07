package org.apache.datawise.backend.common;

import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

/**
 * dbType ids that must be served by a dedicated connector plugin; generic JDBC must not兜底.
 */
public final class PluginOwnedDbTypes {

    private static final Set<String> IDS = build();

    private PluginOwnedDbTypes() {
    }

    private static Set<String> build() {
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        for (DbType type : DbType.values()) {
            if (type == DbType.GENERIC || type == DbType.OTHER) {
                continue;
            }
            ids.add(type.id());
        }
        ids.addAll(DbTypeAliases.aliasIds());
        return Set.copyOf(ids);
    }

    public static boolean contains(String dbType) {
        if (dbType == null || dbType.isBlank()) {
            return false;
        }
        return IDS.contains(dbType.trim().toLowerCase(Locale.ROOT));
    }

    public static Set<String> ids() {
        return IDS;
    }
}
