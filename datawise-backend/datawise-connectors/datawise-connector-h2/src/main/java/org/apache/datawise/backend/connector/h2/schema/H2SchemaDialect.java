package org.apache.datawise.backend.connector.h2.schema;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.schema.SchemaDialect;
import org.apache.datawise.backend.schema.SchemaScope;

import java.sql.Connection;

public final class H2SchemaDialect implements SchemaDialect {

    @Override
    public String id() {
        return DbType.H2.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.H2.matches(dbType);
    }

    @Override
    public SchemaScope resolveScope(Connection connection, String catalogLabel) {
        return new SchemaScope(catalogLabel, catalogLabel, catalogLabel);
    }
}
