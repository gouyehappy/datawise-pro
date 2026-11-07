package org.apache.datawise.backend.connector.trino.support;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.trino.family.CatalogEngineTableMetadataIntrospection;

public final class TrinoTableMetadataIntrospection extends CatalogEngineTableMetadataIntrospection {

    public TrinoTableMetadataIntrospection() {
        super(DbType.TRINO, 24);
    }
}
