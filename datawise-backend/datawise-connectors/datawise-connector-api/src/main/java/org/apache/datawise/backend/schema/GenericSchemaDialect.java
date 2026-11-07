package org.apache.datawise.backend.schema;

import org.springframework.stereotype.Component;

import java.sql.Connection;

@Component
public class GenericSchemaDialect implements SchemaDialect {

    @Override
    public String id() {
        return "generic";
    }

    @Override
    public boolean supports(String dbType) {
        return true;
    }

    @Override
    public SchemaScope resolveScope(Connection connection, String catalogLabel) {
        return new SchemaScope(catalogLabel, null, catalogLabel);
    }
}
