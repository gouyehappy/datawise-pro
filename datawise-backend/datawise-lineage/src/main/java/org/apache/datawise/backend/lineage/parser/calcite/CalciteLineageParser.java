package org.apache.datawise.backend.lineage.parser.calcite;

import org.apache.datawise.backend.domain.LineageDialectCompatibility;
import org.apache.datawise.backend.lineage.model.LineageParseRequest;
import org.apache.datawise.backend.lineage.model.LineageParseResult;
import org.apache.datawise.backend.lineage.spi.SqlLineageParser;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.Set;

/**
 * Phase 3 Calcite 解析器占位实现。
 * 启用 {@code lineage.calcite.enabled=true} 后注册；未实现前返回 FAILED，由 fallback 链继续。
 */
@Component
@ConditionalOnProperty(name = "lineage.calcite.enabled", havingValue = "true")
public class CalciteLineageParser implements SqlLineageParser {

    private static final Set<String> OLAP = Set.of(
            "flink", "hive", "spark", "trino", "presto", "impala", "kylin"
    );

    @Override
    public boolean supports(String dbType) {
        return dbType != null && OLAP.contains(dbType.toLowerCase());
    }

    @Override
    public int priority() {
        // After lakehouse front door (40) / sqlflow-ast (50); only useful once implemented.
        return 60;
    }

    @Override
    public String engineId() {
        return "calcite";
    }

    @Override
    public String engineVersion() {
        return "pending";
    }

    @Override
    public LineageParseResult parse(LineageParseRequest request) {
        return LineageParseResult.failed(
                engineId(),
                engineVersion(),
                LineageDialectCompatibility.PARTIAL,
                "Calcite lakehouse parser is not implemented yet; use the lakehouse/AST fallback path"
        );
    }
}
