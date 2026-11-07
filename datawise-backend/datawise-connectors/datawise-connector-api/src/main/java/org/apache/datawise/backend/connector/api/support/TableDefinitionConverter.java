package org.apache.datawise.backend.connector.api.support;

import org.apache.datawise.backend.ddl.LogicalTypeParserRegistry;
import org.apache.datawise.backend.domain.TableColumnDetail;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.metadata.ColumnDefinition;
import org.apache.datawise.backend.metadata.PrimaryKeyDefinition;
import org.apache.datawise.backend.metadata.TableDefinition;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** 从 {@link TablePropertiesResult} 构建引擎无关 {@link TableDefinition}。 */
public final class TableDefinitionConverter {

    private TableDefinitionConverter() {
    }

    public static TableDefinition fromProperties(
                                                 TablePropertiesResult properties,
                                                 String sourceDbType,
                                                 String catalog,
                                                 String schema,
                                                 LogicalTypeParserRegistry typeParserRegistry) {
        List<String> pkColumns = new ArrayList<>();
        List<ColumnDefinition> columns = new ArrayList<>();
        for (TableColumnDetail column : properties.columns()) {
            if ("PRI".equalsIgnoreCase(column.keyType())) {
                pkColumns.add(column.name());
            }
            columns.add(new ColumnDefinition(
                    column.name(),
                    typeParserRegistry.parse(column.dataType(), sourceDbType),
                    column.nullable(),
                    column.defaultValue(),
                    column.autoIncrement(),
                    column.comment(),
                    column.ordinal()));
        }
        PrimaryKeyDefinition primaryKey = pkColumns.isEmpty()
                ? null
                : new PrimaryKeyDefinition(defaultPrimaryKeyName(properties.tableName()), List.copyOf(pkColumns));
        return new TableDefinition(
                catalog,
                schema,
                properties.tableName(),
                columns,
                primaryKey,
                List.of(),
                List.of(),
                Map.of(),
                properties.comment());
    }

    private static String defaultPrimaryKeyName(String tableName) {
        return "pk_" + tableName.toLowerCase(Locale.ROOT);
    }
}
