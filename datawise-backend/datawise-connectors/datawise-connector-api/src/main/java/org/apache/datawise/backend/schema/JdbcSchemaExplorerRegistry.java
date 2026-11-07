package org.apache.datawise.backend.schema;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.ConnectorPluginContributionHolder;
import org.apache.datawise.backend.schema.spi.JdbcSchemaExplorer;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

/** Resolves optional {@link JdbcSchemaExplorer} overrides from classpath beans and connector plugins. */
@Component
public class JdbcSchemaExplorerRegistry {

    private final List<JdbcSchemaExplorer> classpathExplorers;
    private final ConnectorPluginContributionHolder contributionHolder;

    public JdbcSchemaExplorerRegistry(
                                      List<JdbcSchemaExplorer> classpathExplorers,
                                      ConnectorPluginContributionHolder contributionHolder) {
        this.classpathExplorers = classpathExplorers == null ? List.of() : List.copyOf(classpathExplorers);
        this.contributionHolder = contributionHolder;
    }

    public Optional<JdbcSchemaExplorer> find(String dbType) {
        String normalized = DbType.normalizeId(dbType);
        return allExplorers().stream()
                .filter(explorer -> explorer.supports(normalized))
                .min(Comparator.comparingInt(JdbcSchemaExplorer::priority));
    }

    private List<JdbcSchemaExplorer> allExplorers() {
        if (contributionHolder.schemaExplorers().isEmpty()) {
            return classpathExplorers;
        }
        List<JdbcSchemaExplorer> merged = new ArrayList<>(classpathExplorers);
        merged.addAll(contributionHolder.schemaExplorers());
        return merged;
    }
}
