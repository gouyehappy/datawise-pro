package org.apache.datawise.backend.jdbc.introspect;

/** Feature flags for {@link MysqlFamilyTableIntrospector}. */
public record MysqlFamilyIntrospectOptions(
        boolean includeAutoIncrement,
        boolean resolveCharsetFromCollation) {

    public static MysqlFamilyIntrospectOptions mysql() {
        return new MysqlFamilyIntrospectOptions(true, true);
    }

    public static MysqlFamilyIntrospectOptions olap() {
        return new MysqlFamilyIntrospectOptions(false, false);
    }
}
