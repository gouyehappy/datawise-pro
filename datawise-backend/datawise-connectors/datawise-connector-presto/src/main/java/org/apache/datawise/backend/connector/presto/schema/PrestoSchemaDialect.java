package org.apache.datawise.backend.connector.presto.schema;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.trino.family.CatalogEngineSchemaDialect;

public final class PrestoSchemaDialect extends CatalogEngineSchemaDialect {

    public PrestoSchemaDialect() {
        super(DbType.PRESTO);
    }
}
