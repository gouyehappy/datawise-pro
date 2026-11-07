package org.apache.datawise.backend.ddl;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.ConnectorPluginContributionHolder;
import org.apache.datawise.backend.ddl.spi.LogicalTypeParser;
import org.apache.datawise.backend.metadata.LogicalType;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** 按 dbType 解析 {@link LogicalTypeParser}。 */
@Component
public class LogicalTypeParserRegistry {

    private final List<LogicalTypeParser> classpathParsers;
    private final ConnectorPluginContributionHolder contributionHolder;

    public LogicalTypeParserRegistry(
                                     List<LogicalTypeParser> classpathParsers,
                                     ConnectorPluginContributionHolder contributionHolder) {
        this.classpathParsers = classpathParsers == null ? List.of() : List.copyOf(classpathParsers);
        this.contributionHolder = contributionHolder;
    }

    public LogicalType parse(String physicalType, String sourceDbType) {
        return require(sourceDbType).parse(physicalType);
    }

    public LogicalTypeParser require(String sourceDbType) {
        String normalized = DbType.normalizeId(sourceDbType);
        return allParsers().stream()
                .filter(parser -> parser.supports(normalized))
                .min(Comparator.comparingInt(LogicalTypeParser::priority))
                .orElseThrow(() -> new IllegalStateException("No LogicalTypeParser for dbType: " + normalized));
    }

    private List<LogicalTypeParser> allParsers() {
        if (contributionHolder.logicalTypeParsers().isEmpty()) {
            return classpathParsers;
        }
        List<LogicalTypeParser> merged = new ArrayList<>(classpathParsers);
        merged.addAll(contributionHolder.logicalTypeParsers());
        return merged;
    }
}
