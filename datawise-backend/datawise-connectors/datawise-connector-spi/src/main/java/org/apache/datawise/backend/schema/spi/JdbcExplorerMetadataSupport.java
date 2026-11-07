package org.apache.datawise.backend.schema.spi;

/**
 * Combined Explorer view + routine metadata SPI.
 * <p>Register one Spring bean implementing this interface; both
 * {@code JdbcSchemaViewListerRegistry} and {@code JdbcRoutineListerRegistry} will resolve it.
 */
public interface JdbcExplorerMetadataSupport extends JdbcSchemaViewLister, JdbcRoutineLister {

    /** Resolves default collision between parent interfaces; lower value still wins in registries. */
    @Override
    default int priority() {
        return 100;
    }
}
