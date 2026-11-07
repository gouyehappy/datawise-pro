package org.apache.datawise.backend.schema.spi;

import org.apache.datawise.backend.domain.PaginatedTreeNodes;

import java.sql.SQLException;

/**
 * Dialect-specific fast table listing via information_schema / dictionary SQL.
 * Register as a Spring bean; {@code FastTableListingRegistry} picks the lowest {@link #priority()}.
 * <p>Use {@link ExplorerPageRequest} (includes scope, dialect, skeleton, paging).
 */
public interface FastTableLister {

    boolean supports(String dbType);

    /** Lower value wins when multiple listers match. */
    default int priority() {
        return 100;
    }

    PaginatedTreeNodes listTablesPage(ExplorerPageRequest request) throws SQLException;
}
