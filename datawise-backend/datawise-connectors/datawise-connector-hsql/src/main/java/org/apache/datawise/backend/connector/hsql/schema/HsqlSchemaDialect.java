package org.apache.datawise.backend.connector.hsql.schema;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.schema.SchemaDialect;
import org.apache.datawise.backend.schema.SchemaScope;

import java.sql.Connection;

public final class HsqlSchemaDialect implements SchemaDialect {

    @Override
    public String id() {
        return DbType.HSQL.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.HSQL.matches(dbType);
    }

    @Override
    public SchemaScope resolveScope(Connection connection, String catalogLabel) {
        return new SchemaScope(catalogLabel, catalogLabel, catalogLabel);
    }
}
