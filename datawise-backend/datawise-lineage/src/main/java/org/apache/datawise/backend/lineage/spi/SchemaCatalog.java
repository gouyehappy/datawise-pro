package org.apache.datawise.backend.lineage.spi;

import java.util.List;

/**
 * Table column metadata for SELECT * expansion and column disambiguation.
 */
public interface SchemaCatalog {

    SchemaCatalog EMPTY = (schema, table) -> List.of();

    List<String> columns(String schema, String table);
}
