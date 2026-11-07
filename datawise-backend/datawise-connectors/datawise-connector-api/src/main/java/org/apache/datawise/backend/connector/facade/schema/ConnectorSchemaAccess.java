package org.apache.datawise.backend.connector.facade.schema;

import org.apache.datawise.backend.schema.SchemaDialect;
import org.apache.datawise.backend.schema.SchemaDialectRegistry;
import org.springframework.stereotype.Component;

/**
 * Schema 方言解析入口；database 层经 {@link org.apache.datawise.backend.connector.facade.ConnectorFacade} 访问。
 */
@Component
public class ConnectorSchemaAccess {

    private final SchemaDialectRegistry schemaDialectRegistry;

    public ConnectorSchemaAccess(SchemaDialectRegistry schemaDialectRegistry) {
        this.schemaDialectRegistry = schemaDialectRegistry;
    }

    public SchemaDialect resolve(String dbType) {
        return schemaDialectRegistry.resolve(dbType);
    }
}
