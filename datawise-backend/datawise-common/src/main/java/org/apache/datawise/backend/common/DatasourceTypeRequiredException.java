package org.apache.datawise.backend.common;

/**
 * Connection / catalog operation missing a datasource type.
 * Maps to {@link DatawiseErrorCodes#DATASOURCE_TYPE_REQUIRED}.
 */
public class DatasourceTypeRequiredException extends IllegalArgumentException {

    public static final String CODE = DatawiseErrorCodes.DATASOURCE_TYPE_REQUIRED;

    public DatasourceTypeRequiredException() {
        super(CODE);
    }
}
