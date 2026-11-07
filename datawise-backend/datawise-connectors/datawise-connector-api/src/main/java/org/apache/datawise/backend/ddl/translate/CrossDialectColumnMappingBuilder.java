package org.apache.datawise.backend.ddl.translate;

import org.apache.datawise.backend.domain.MigrationColumnTypeMapping;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.metadata.ColumnDefinition;
import org.apache.datawise.backend.metadata.TableDefinition;
import org.apache.datawise.backend.ddl.DialectDdlRendererRegistry;
import org.apache.datawise.backend.ddl.TypeMappingRegistry;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;

/** Builds per-column type mappings and warnings for cross-dialect migration preview. */
final class CrossDialectColumnMappingBuilder {

    private final DialectDdlRendererRegistry ddlRendererRegistry;
    private final TypeMappingRegistry typeMappingRegistry;

    CrossDialectColumnMappingBuilder(
                                     DialectDdlRendererRegistry ddlRendererRegistry,
                                     TypeMappingRegistry typeMappingRegistry) {
        this.ddlRendererRegistry = ddlRendererRegistry;
        this.typeMappingRegistry = typeMappingRegistry;
    }

    List<MigrationColumnTypeMapping> build(
                                           TablePropertiesResult sourceProperties,
                                           TableDefinition sourceDefinition,
                                           TableDefinition targetDefinition,
                                           String sourceDbType,
                                           String targetDbType) {
        List<MigrationColumnTypeMapping> mappings = new ArrayList<>();
        for (int index = 0; index < sourceDefinition.columns().size(); index += 1) {
            ColumnDefinition sourceColumn = sourceDefinition.columns().get(index);
            ColumnDefinition targetColumn = targetDefinition.columns().get(index);
            String sourceType = sourceProperties.columns().get(index).dataType();
            String warning = typeMappingRegistry.mappingWarning(sourceColumn.type(), sourceDbType, targetDbType);
            mappings.add(new MigrationColumnTypeMapping(
                    targetColumn.name(),
                    sourceType,
                    ddlRendererRegistry.renderPhysicalType(targetColumn.type(), targetDbType),
                    warning));
        }
        return mappings;
    }

    List<String> collectWarnings(List<MigrationColumnTypeMapping> mappings) {
        LinkedHashSet<String> warnings = new LinkedHashSet<>();
        for (MigrationColumnTypeMapping mapping : mappings) {
            if (mapping.warning() != null && !mapping.warning().isBlank()) {
                warnings.add(mapping.warning());
            }
        }
        return List.copyOf(warnings);
    }
}
