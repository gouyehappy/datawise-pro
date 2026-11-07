package org.apache.datawise.backend.sql;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.ConnectorPluginContributionHolder;
import org.apache.datawise.backend.jdbc.execution.pagination.SqlPaginationBuiltinDialects;
import org.apache.datawise.backend.sql.spi.SqlPaginationDialect;
import org.apache.datawise.backend.sql.spi.SqlPaginationService;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** 按 dbType 解析 {@link SqlPaginationDialect}。 */
@Component
public class SqlPaginationDialectRegistry implements SqlPaginationService {

    private final List<SqlPaginationDialect> classpathDialects;
    private final ConnectorPluginContributionHolder contributionHolder;

    public SqlPaginationDialectRegistry(
                                        List<SqlPaginationDialect> classpathDialects,
                                        ConnectorPluginContributionHolder contributionHolder) {
        this.classpathDialects = classpathDialects == null ? List.of() : List.copyOf(classpathDialects);
        this.contributionHolder = contributionHolder;
    }

    public SqlPaginationDialect require(String dbType) {
        String normalized = DbType.normalizeId(dbType);
        return allDialects().stream()
                .filter(dialect -> dialect.supports(normalized))
                .min(Comparator.comparingInt(SqlPaginationDialect::priority))
                .orElseGet(() -> SqlPaginationBuiltinDialects.resolve(normalized));
    }

    @Override
    public String applyLimitOffset(String sql, String dbType, int limit, int offset) {
        return require(dbType).applyLimitOffset(sql, limit, offset);
    }

    private List<SqlPaginationDialect> allDialects() {
        if (contributionHolder.sqlPaginationDialects().isEmpty()) {
            return classpathDialects;
        }
        List<SqlPaginationDialect> merged = new ArrayList<>(classpathDialects);
        merged.addAll(contributionHolder.sqlPaginationDialects());
        return merged;
    }
}
