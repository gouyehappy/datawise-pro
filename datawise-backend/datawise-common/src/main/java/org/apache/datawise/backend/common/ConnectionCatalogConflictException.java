package org.apache.datawise.backend.common;

/**
 * Optimistic concurrency conflict while updating the connection catalog.
 * Maps to {@link DatawiseErrorCodes#CONNECTION_CATALOG_CONFLICT}.
 */
public class ConnectionCatalogConflictException extends IllegalStateException {

    public static final String CODE = DatawiseErrorCodes.CONNECTION_CATALOG_CONFLICT;

    public ConnectionCatalogConflictException() {
        super(CODE);
    }
}
