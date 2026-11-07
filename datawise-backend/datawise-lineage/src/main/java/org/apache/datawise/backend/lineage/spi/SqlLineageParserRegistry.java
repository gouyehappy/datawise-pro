package org.apache.datawise.backend.lineage.spi;

import org.apache.datawise.backend.domain.LineageDialectCompatibility;
import org.apache.datawise.backend.lineage.model.LineageParseRequest;
import org.apache.datawise.backend.lineage.model.LineageParseResult;
import org.apache.datawise.backend.lineage.model.LineageWarning;
import org.apache.datawise.backend.lineage.model.ParseStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Comparator;
import java.util.List;

@Component
public class SqlLineageParserRegistry {

    private static final Logger log = LoggerFactory.getLogger(SqlLineageParserRegistry.class);

    private final List<SqlLineageParser> parsers;

    public SqlLineageParserRegistry(List<SqlLineageParser> parsers) {
        this.parsers = parsers == null ? List.of() : List.copyOf(parsers);
    }

    public SqlLineageParser require(String dbType) {
        return parsers.stream()
                .filter(parser -> parser.supports(dbType))
                .min(Comparator.comparingInt(SqlLineageParser::priority))
                .orElseThrow(() -> new IllegalStateException("No SqlLineageParser for dbType: " + dbType));
    }

    public LineageParseResult parseWithFallback(LineageParseRequest request) {
        String dbType = request.dbType() == null ? "generic" : request.dbType();
        List<SqlLineageParser> candidates = parsers.stream()
                .filter(parser -> parser.supports(dbType))
                .sorted(Comparator.comparingInt(SqlLineageParser::priority))
                .toList();
        if (log.isInfoEnabled()) {
            log.info(
                    "Lineage parser candidates dbType={} model={} candidates={}",
                    dbType,
                    request.modelName(),
                    candidates.stream()
                            .map(parser -> parser.engineId() + "@" + parser.priority())
                            .toList()
            );
        }
        if (candidates.isEmpty()) {
            log.warn("No lineage parser matched dbType={} model={}", dbType, request.modelName());
            return new LineageParseResult(
                    List.of(),
                    List.of(LineageWarning.of("UNSUPPORTED_DIALECT", "No parser for dbType: " + dbType)),
                    ParseStatus.FAILED,
                    "none",
                    "0",
                    LineageDialectCompatibility.UNKNOWN
            );
        }
        LineageParseResult last = null;
        for (SqlLineageParser parser : candidates) {
            log.info(
                    "Trying lineage parser engine={} priority={} dbType={} model={}",
                    parser.engineId(),
                    parser.priority(),
                    dbType,
                    request.modelName()
            );
            LineageParseResult result = parser.parse(request);
            last = result;
            if (result.status() != ParseStatus.FAILED) {
                log.info(
                        "Selected lineage parser engine={} status={} compatibility={} dbType={} model={}",
                        result.engineId(),
                        result.status(),
                        result.dialectCompatibility(),
                        dbType,
                        request.modelName()
                );
                return result;
            }
            log.warn(
                    "Lineage parser failed engine={} dbType={} model={} warnings={} messages={}",
                    result.engineId(),
                    dbType,
                    request.modelName(),
                    result.warnings().stream().map(LineageWarning::code).toList(),
                    result.warnings().stream().map(LineageWarning::message).toList()
            );
        }
        log.warn("All lineage parsers failed dbType={} model={}", dbType, request.modelName());
        return last != null
                ? last
                : LineageParseResult.failed("none", "0", "Lineage parsing failed");
    }
}
