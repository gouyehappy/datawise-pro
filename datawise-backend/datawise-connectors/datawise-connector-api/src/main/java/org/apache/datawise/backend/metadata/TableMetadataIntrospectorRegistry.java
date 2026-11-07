package org.apache.datawise.backend.metadata;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.ConnectorPluginContributionHolder;
import org.apache.datawise.backend.metadata.spi.TableMetadataIntrospection;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** 按 dbType 解析 {@link TableMetadataIntrospection}。 */
@Component
public class TableMetadataIntrospectorRegistry {

    private final List<TableMetadataIntrospection> classpathIntrospectors;
    private final ConnectorPluginContributionHolder contributionHolder;

    public TableMetadataIntrospectorRegistry(
                                             List<TableMetadataIntrospection> classpathIntrospectors,
                                             ConnectorPluginContributionHolder contributionHolder) {
        this.classpathIntrospectors = classpathIntrospectors == null ? List.of() : List.copyOf(classpathIntrospectors);
        this.contributionHolder = contributionHolder;
    }

    public TableMetadataIntrospection require(String dbType) {
        String normalized = DbType.normalizeId(dbType);
        return allIntrospectors().stream()
                .filter(introspector -> introspector.supports(normalized))
                .min(Comparator.comparingInt(TableMetadataIntrospection::priority))
                .orElseThrow(() -> new IllegalStateException("No TableMetadataIntrospection for dbType: " + normalized));
    }

    private List<TableMetadataIntrospection> allIntrospectors() {
        if (contributionHolder.tableIntrospectors().isEmpty()) {
            return classpathIntrospectors;
        }
        List<TableMetadataIntrospection> merged = new ArrayList<>(classpathIntrospectors);
        merged.addAll(contributionHolder.tableIntrospectors());
        return merged;
    }
}
