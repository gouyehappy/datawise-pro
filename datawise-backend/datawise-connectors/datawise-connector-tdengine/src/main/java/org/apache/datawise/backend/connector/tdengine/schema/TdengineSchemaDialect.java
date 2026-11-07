package org.apache.datawise.backend.connector.tdengine.schema;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.schema.SchemaDialect;
import org.apache.datawise.backend.schema.SchemaScope;

import java.sql.Connection;

public final class TdengineSchemaDialect implements SchemaDialect {

    @Override
    public String id() {
        return DbType.TDENGINE.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.TDENGINE.matches(dbType);
    }

    @Override
    public SchemaScope resolveScope(Connection connection, String catalogLabel) {
        return new SchemaScope(catalogLabel, catalogLabel, catalogLabel);
    }
}
