package org.apache.datawise.backend.common;

/**
 * Requested JDBC connector plugin is not loaded in this runtime.
 * Maps to {@link DatawiseErrorCodes#DATASOURCE_NOT_AVAILABLE}.
 */
public class DatasourceNotAvailableException extends IllegalArgumentException {

    public static final String CODE = DatawiseErrorCodes.DATASOURCE_NOT_AVAILABLE;

    private final String dbType;

    public DatasourceNotAvailableException(String dbType) {
        super(CODE + ": " + (dbType != null ? dbType : ""));
        this.dbType = dbType != null ? dbType : "";
    }

    public String dbType() {
        return dbType;
    }
}
