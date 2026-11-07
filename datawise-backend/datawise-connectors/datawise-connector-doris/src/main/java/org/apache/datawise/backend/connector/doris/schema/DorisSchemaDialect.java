package org.apache.datawise.backend.connector.doris.schema;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.schema.SchemaDialect;
import org.apache.datawise.backend.schema.SchemaScope;
import org.apache.datawise.backend.schema.SystemCatalogNames;

import java.sql.Connection;
import java.util.Set;

public class DorisSchemaDialect implements SchemaDialect {

    private static final Set<String> DORIS_EXTRA_CATALOGS = Set.of("__internal_schema");

    @Override
    public String id() {
        return DbType.DORIS.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.DORIS.matches(dbType);
    }

    @Override
    public SchemaScope resolveScope(Connection connection, String catalogLabel) {
        return new SchemaScope(catalogLabel, null, catalogLabel);
    }

    @Override
    public boolean isSystemCatalog(String catalog) {
        return SystemCatalogNames.isMysqlProtocolSystemCatalog(catalog)
                || SystemCatalogNames.isNamed(catalog, DORIS_EXTRA_CATALOGS);
    }
}
