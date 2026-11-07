package org.apache.datawise.backend.ddl.translate;

import org.apache.datawise.backend.domain.MigrationColumnTypeMapping;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.metadata.TableDefinition;
import org.apache.datawise.backend.ddl.DdlRenderOptions;
import org.apache.datawise.backend.ddl.DialectDdlRendererRegistry;
import org.apache.datawise.backend.ddl.LogicalTypeParserRegistry;
import org.apache.datawise.backend.ddl.TypeMappingRegistry;
import org.apache.datawise.backend.connector.api.support.TableDefinitionConverter;

import java.util.List;

/** Orchestrates cross-dialect CREATE TABLE generation. */
public final class CrossDialectDdlBuildPipeline {

    private final DialectDdlRendererRegistry ddlRendererRegistry;
    private final LogicalTypeParserRegistry logicalTypeParserRegistry;
    private final CrossDialectSchemaResolver schemaResolver;
    private final CrossDialectDefinitionTranslator definitionTranslator;
    private final CrossDialectColumnMappingBuilder columnMappingBuilder;

    private CrossDialectDdlBuildPipeline(
                                         DialectDdlRendererRegistry ddlRendererRegistry,
                                         LogicalTypeParserRegistry logicalTypeParserRegistry,
                                         CrossDialectSchemaResolver schemaResolver,
                                         CrossDialectDefinitionTranslator definitionTranslator,
                                         CrossDialectColumnMappingBuilder columnMappingBuilder) {
        this.ddlRendererRegistry = ddlRendererRegistry;
        this.logicalTypeParserRegistry = logicalTypeParserRegistry;
        this.schemaResolver = schemaResolver;
        this.definitionTranslator = definitionTranslator;
        this.columnMappingBuilder = columnMappingBuilder;
    }

    public static CrossDialectDdlBuildPipeline create(
                                                      DialectDdlRendererRegistry ddlRendererRegistry,
                                                      TypeMappingRegistry typeMappingRegistry,
                                                      LogicalTypeParserRegistry logicalTypeParserRegistry) {
        CrossDialectSchemaResolver schemaResolver = new CrossDialectSchemaResolver();
        CrossDialectDefinitionTranslator definitionTranslator =
                new CrossDialectDefinitionTranslator(typeMappingRegistry, schemaResolver);
        CrossDialectColumnMappingBuilder columnMappingBuilder =
                new CrossDialectColumnMappingBuilder(ddlRendererRegistry, typeMappingRegistry);
        return new CrossDialectDdlBuildPipeline(
                ddlRendererRegistry,
                logicalTypeParserRegistry,
                schemaResolver,
                definitionTranslator,
                columnMappingBuilder);
    }

    public CrossDialectDdlBuildResult build(
                                            TablePropertiesResult sourceProperties,
                                            String sourceDbType,
                                            String targetDbType,
                                            String targetDatabase,
                                            String sourceDatabase) {
        if (sourceProperties == null || sourceProperties.columns() == null || sourceProperties.columns().isEmpty()) {
            return new CrossDialectDdlBuildResult(List.of(), null, List.of("sourceTableMissing"));
        }

        String source = schemaResolver.normalizeDbType(sourceDbType);
        String target = schemaResolver.normalizeDbType(targetDbType);

        TableDefinition sourceDefinition = TableDefinitionConverter.fromProperties(
                sourceProperties,
                source,
                sourceDatabase,
                schemaResolver.schemaForSource(source, sourceDatabase),
                logicalTypeParserRegistry);
        TableDefinition targetDefinition = definitionTranslator.translate(sourceDefinition, source, target);
        List<MigrationColumnTypeMapping> mappings = columnMappingBuilder.build(
                sourceProperties,
                sourceDefinition,
                targetDefinition,
                source,
                target);

        String ddl = ddlRendererRegistry.renderCreateTable(
                targetDefinition,
                target,
                DdlRenderOptions.forTarget(targetDatabase, target));
        return new CrossDialectDdlBuildResult(
                mappings,
                ddl,
                columnMappingBuilder.collectWarnings(mappings));
    }

    public record CrossDialectDdlBuildResult(
            List<MigrationColumnTypeMapping> columnMappings,
            String suggestedCreateDdl,
            List<String> warnings) {
    }
}
