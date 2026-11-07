package org.apache.datawise.backend.connector.presto.support;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.trino.family.CatalogEngineTableMetadataIntrospection;

public final class PrestoTableMetadataIntrospection extends CatalogEngineTableMetadataIntrospection {

    public PrestoTableMetadataIntrospection() {
        super(DbType.PRESTO, 24);
    }
}
