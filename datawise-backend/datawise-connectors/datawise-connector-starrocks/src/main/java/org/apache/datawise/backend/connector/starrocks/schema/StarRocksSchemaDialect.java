package org.apache.datawise.backend.connector.starrocks.schema;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.schema.SchemaDialect;
import org.apache.datawise.backend.schema.SchemaScope;
import org.apache.datawise.backend.schema.SystemCatalogNames;

import java.sql.Connection;
import java.util.Set;

public class StarRocksSchemaDialect implements SchemaDialect {

    private static final Set<String> STARROCKS_EXTRA_CATALOGS = Set.of("_statistics_");

    @Override
    public String id() {
        return DbType.STARROCKS.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.STARROCKS.matches(dbType);
    }

    @Override
    public SchemaScope resolveScope(Connection connection, String catalogLabel) {
        return new SchemaScope(catalogLabel, null, catalogLabel);
    }

    @Override
    public boolean isSystemCatalog(String catalog) {
        return SystemCatalogNames.isMysqlProtocolSystemCatalog(catalog)
                || SystemCatalogNames.isNamed(catalog, STARROCKS_EXTRA_CATALOGS);
    }
}
