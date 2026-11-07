package org.apache.datawise.backend.connector.mysql.schema;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.schema.SchemaDialect;
import org.apache.datawise.backend.schema.SchemaScope;
import org.apache.datawise.backend.schema.SystemCatalogNames;

import java.sql.Connection;

public class MysqlSchemaDialect implements SchemaDialect {

    @Override
    public String id() {
        return DbType.MYSQL.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.isMysqlFamily(dbType);
    }

    @Override
    public SchemaScope resolveScope(Connection connection, String catalogLabel) {
        return new SchemaScope(catalogLabel, null, catalogLabel);
    }

    @Override
    public boolean isSystemCatalog(String catalog) {
        return SystemCatalogNames.isMysqlProtocolSystemCatalog(catalog);
    }
}
