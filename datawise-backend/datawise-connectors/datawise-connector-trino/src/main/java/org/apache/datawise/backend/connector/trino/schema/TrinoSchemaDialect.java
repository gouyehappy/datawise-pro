package org.apache.datawise.backend.connector.trino.schema;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.trino.family.CatalogEngineSchemaDialect;

public final class TrinoSchemaDialect extends CatalogEngineSchemaDialect {

    public TrinoSchemaDialect() {
        super(DbType.TRINO);
    }
}
