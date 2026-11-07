package org.apache.datawise.backend.ddl.translate;

import org.apache.datawise.backend.metadata.ColumnDefinition;
import org.apache.datawise.backend.metadata.LogicalType;
import org.apache.datawise.backend.metadata.TableDefinition;
import org.apache.datawise.backend.ddl.TypeMappingRegistry;

import java.util.ArrayList;
import java.util.List;

/** Maps source {@link TableDefinition} columns to target dialect logical types. */
final class CrossDialectDefinitionTranslator {

    private final TypeMappingRegistry typeMappingRegistry;
    private final CrossDialectSchemaResolver schemaResolver;

    CrossDialectDefinitionTranslator(
                                     TypeMappingRegistry typeMappingRegistry,
                                     CrossDialectSchemaResolver schemaResolver) {
        this.typeMappingRegistry = typeMappingRegistry;
        this.schemaResolver = schemaResolver;
    }

    TableDefinition translate(TableDefinition source, String sourceDbType, String targetDbType) {
        List<ColumnDefinition> columns = new ArrayList<>();
        for (ColumnDefinition column : source.columns()) {
            LogicalType mapped = typeMappingRegistry.map(column.type(), sourceDbType, targetDbType);
            columns.add(new ColumnDefinition(
                    column.name(),
                    mapped,
                    column.nullable(),
                    schemaResolver.sanitizeDefault(column.defaultExpression(), sourceDbType, targetDbType),
                    column.autoIncrement(),
                    column.comment(),
                    column.ordinalPosition()));
        }
        return new TableDefinition(
                source.catalog(),
                source.schema(),
                source.name(),
                columns,
                source.primaryKey(),
                List.of(),
                List.of(),
                source.tableOptions(),
                source.comment());
    }
}
