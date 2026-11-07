package org.apache.datawise.backend.ddl;

import org.apache.datawise.backend.ddl.spi.DialectDdlRenderer;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.ConnectorPluginContributionHolder;

/** 按 dbType 解析 {@link DialectDdlRenderer} 实现。 */
@Component
public class DialectDdlRendererRegistry {

    private final List<DialectDdlRenderer> classpathRenderers;
    private final ConnectorPluginContributionHolder contributionHolder;

    public DialectDdlRendererRegistry(
                                      List<DialectDdlRenderer> classpathRenderers,
                                      ConnectorPluginContributionHolder contributionHolder) {
        this.classpathRenderers = classpathRenderers == null ? List.of() : List.copyOf(classpathRenderers);
        this.contributionHolder = contributionHolder;
    }

    private List<DialectDdlRenderer> allRenderers() {
        if (contributionHolder.ddlRenderers().isEmpty()) {
            return classpathRenderers;
        }
        List<DialectDdlRenderer> merged = new ArrayList<>(classpathRenderers);
        merged.addAll(contributionHolder.ddlRenderers());
        return merged;
    }

    public DialectDdlRenderer require(String dbType) {
        String normalized = normalizeDbType(dbType);
        return allRenderers().stream()
                .filter(renderer -> renderer.supports(normalized))
                .min(Comparator.comparingInt(DialectDdlRenderer::priority))
                .orElseThrow(() -> new DdlException(
                        DdlErrorCode.RENDERER_NOT_FOUND,
                        "No DDL renderer for dbType: " + normalized));
    }

    public String renderCreateTable(
                                    org.apache.datawise.backend.metadata.TableDefinition definition,
                                    String targetDbType,
                                    DdlRenderOptions options) {
        return require(targetDbType).renderCreateTable(definition, options);
    }

    public String renderPhysicalType(
                                     org.apache.datawise.backend.metadata.LogicalType type,
                                     String targetDbType) {
        return require(targetDbType).renderPhysicalType(type);
    }

    private static String normalizeDbType(String dbType) {
        return DbType.normalizeId(dbType);
    }
}
