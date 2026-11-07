package org.apache.datawise.backend.connector.trino;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.spi.ConnectorDialectContributions;
import org.apache.datawise.backend.connector.trino.family.CatalogEngineDmlDialect;
import org.apache.datawise.backend.connector.trino.family.CatalogEngineSchemaDialect;
import org.apache.datawise.backend.connector.trino.family.CatalogEngineSqlPaginationDialect;
import org.apache.datawise.backend.connector.trino.family.CatalogEngineTableMetadataIntrospection;

/** Trino / Presto catalog 引擎插件的统一方言注册。 */
public final class CatalogEngineRegistration {

    private CatalogEngineRegistration() {
    }

    public static ConnectorDialectContributions contributions(DbType dbType, int priority) {
        return ConnectorDialectContributions.builder()
                .addSchemaDialect(new CatalogEngineSchemaDialect(dbType))
                .addTableIntrospector(new CatalogEngineTableMetadataIntrospection(dbType, priority))
                .addDmlDialect(new CatalogEngineDmlDialect(dbType, priority))
                .addSqlPaginationDialect(new CatalogEngineSqlPaginationDialect(dbType, priority))
                .build();
    }
}
