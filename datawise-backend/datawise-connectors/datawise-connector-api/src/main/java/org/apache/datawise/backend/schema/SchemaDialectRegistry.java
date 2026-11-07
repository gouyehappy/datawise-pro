package org.apache.datawise.backend.schema;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.ConnectorPluginContributionHolder;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
public class SchemaDialectRegistry {

    private final List<SchemaDialect> dialects;
    private final SchemaDialect fallback;

    public SchemaDialectRegistry(
                                 List<SchemaDialect> classpathDialects,
                                 GenericSchemaDialect genericSchemaDialect,
                                 ConnectorPluginContributionHolder contributionHolder) {
        List<SchemaDialect> merged = new ArrayList<>();
        if (classpathDialects != null) {
            for (SchemaDialect dialect : classpathDialects) {
                if (!(dialect instanceof GenericSchemaDialect)) {
                    merged.add(dialect);
                }
            }
        }
        merged.addAll(contributionHolder.schemaDialects());
        this.dialects = List.copyOf(merged);
        this.fallback = genericSchemaDialect;
    }

    public SchemaDialect resolve(String dbType) {
        String normalized = DbType.normalizeId(dbType);
        for (SchemaDialect dialect : dialects) {
            if (dialect.supports(normalized)) {
                return dialect;
            }
        }
        return fallback;
    }
}
