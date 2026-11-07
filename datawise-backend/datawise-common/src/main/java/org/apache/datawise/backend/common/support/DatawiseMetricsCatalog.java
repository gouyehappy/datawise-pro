package org.apache.datawise.backend.common.support;

/** Custom Micrometer metric names registered by DataWise backend components. */
public final class DatawiseMetricsCatalog {

    public static final String JDBC_POOLS_ACTIVE = "datawise.jdbc.pools.active";
    public static final String EXPLORER_SCHEMA_SESSIONS_ACTIVE = "datawise.explorer.schema-sessions.active";
    public static final String EXPLORER_LOAD_CHILDREN_NOT_MODIFIED = "datawise.explorer.loadChildren.notModified";
    public static final String EXPLORER_LOAD_CHILDREN_MODIFIED = "datawise.explorer.loadChildren.modified";

    private DatawiseMetricsCatalog() {
    }
}
