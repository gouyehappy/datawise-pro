package org.apache.datawise.backend.schema.introspect;

import org.apache.datawise.backend.schema.SchemaNodeIds;

/** Catalog/schema-aware Explorer object node ids (table / view / routine). */
public final class ExplorerObjectNodeIds {

    private ExplorerObjectNodeIds() {
    }

    public static String objectId(
                                  String prefix,
                                  String connectionId,
                                  String catalog,
                                  String schema,
                                  String name) {
        if (schema != null && !schema.isBlank()) {
            if (catalog != null && !catalog.isBlank()) {
                return SchemaNodeIds.nodeId(prefix, connectionId, catalog, schema, name);
            }
            return SchemaNodeIds.nodeId(prefix, connectionId, schema, name);
        }
        return SchemaNodeIds.nodeId(prefix, connectionId, catalog, name);
    }
}
