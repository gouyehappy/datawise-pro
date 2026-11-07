package org.apache.datawise.backend.ddl;

import org.apache.datawise.backend.domain.MigrationColumnTypeMapping;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.ddl.translate.CrossDialectDdlBuildPipeline;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 跨方言 DDL 编排：TableDefinition 转换 → 类型映射 → 方言渲染器输出 CREATE TABLE。
 */
@Component
public class CrossDialectDdlTranslator {

    private final CrossDialectDdlBuildPipeline buildPipeline;

    public CrossDialectDdlTranslator(
                                     DialectDdlRendererRegistry ddlRendererRegistry,
                                     TypeMappingRegistry typeMappingRegistry,
                                     LogicalTypeParserRegistry logicalTypeParserRegistry) {
        this.buildPipeline = CrossDialectDdlBuildPipeline.create(
                ddlRendererRegistry,
                typeMappingRegistry,
                logicalTypeParserRegistry);
    }

    public record CrossDialectDdlPreview(
            List<MigrationColumnTypeMapping> columnMappings,
            String suggestedCreateDdl,
            List<String> warnings) {
    }

    public CrossDialectDdlPreview preview(
                                          TablePropertiesResult sourceProperties,
                                          String sourceDbType,
                                          String targetDbType,
                                          String targetDatabase,
                                          String sourceDatabase) {
        CrossDialectDdlBuildPipeline.CrossDialectDdlBuildResult built = buildPipeline.build(
                sourceProperties,
                sourceDbType,
                targetDbType,
                targetDatabase,
                sourceDatabase);
        return new CrossDialectDdlPreview(built.columnMappings(), built.suggestedCreateDdl(), built.warnings());
    }

    public String renderCreateDdl(
                                  TablePropertiesResult sourceProperties,
                                  String sourceDbType,
                                  String targetDbType,
                                  String targetDatabase,
                                  String sourceDatabase) {
        return buildPipeline.build(
                sourceProperties,
                sourceDbType,
                targetDbType,
                targetDatabase,
                sourceDatabase).suggestedCreateDdl();
    }
}
