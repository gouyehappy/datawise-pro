package org.apache.datawise.backend.lineage.spi;

import org.apache.datawise.backend.domain.LineageDialectCompatibility;
import org.apache.datawise.backend.lineage.model.LineageParseRequest;
import org.apache.datawise.backend.lineage.model.LineageParseResult;
import org.apache.datawise.backend.lineage.model.ParseStatus;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

class SqlLineageParserRegistryTest {

    @Test
    void usesHigherPriorityParserFirst() {
        SqlLineageParser primary = stubParser("primary", 10, ParseStatus.COMPLETE);
        SqlLineageParser fallback = stubParser("fallback", 100, ParseStatus.COMPLETE);
        SqlLineageParserRegistry registry = new SqlLineageParserRegistry(List.of(fallback, primary));

        LineageParseResult result = registry.parseWithFallback(request());

        assertEquals("primary", result.engineId());
    }

    @Test
    void fallsBackWhenPrimaryFails() {
        SqlLineageParser primary = stubParser("primary", 10, ParseStatus.FAILED);
        SqlLineageParser fallback = stubParser("fallback", 100, ParseStatus.COMPLETE);
        SqlLineageParserRegistry registry = new SqlLineageParserRegistry(List.of(primary, fallback));

        LineageParseResult result = registry.parseWithFallback(request());

        assertEquals("fallback", result.engineId());
    }

    @Test
    void requireSelectsHighestPrioritySupportingParser() {
        SqlLineageParser primary = stubParser("primary", 10, ParseStatus.COMPLETE);
        SqlLineageParser fallback = stubParser("fallback", 100, ParseStatus.COMPLETE);
        SqlLineageParserRegistry registry = new SqlLineageParserRegistry(List.of(fallback, primary));

        assertSame(primary, registry.require("mysql"));
    }

    private static SqlLineageParser stubParser(String engineId, int priority, ParseStatus status) {
        return new SqlLineageParser() {
            @Override
            public boolean supports(String dbType) {
                return true;
            }

            @Override
            public int priority() {
                return priority;
            }

            @Override
            public String engineId() {
                return engineId;
            }

            @Override
            public String engineVersion() {
                return "test";
            }

            @Override
            public LineageParseResult parse(LineageParseRequest request) {
                if (status == ParseStatus.FAILED) {
                    return LineageParseResult.failed(engineId(), "test", "failed");
                }
                return new LineageParseResult(
                        List.of(),
                        List.of(),
                        status,
                        engineId(),
                        "test",
                        LineageDialectCompatibility.UNKNOWN
                );
            }
        };
    }

    private static LineageParseRequest request() {
        return new LineageParseRequest(
                "SELECT 1",
                "mysql",
                "conn-1",
                "demo",
                "demo",
                "preview",
                3,
                Set.of()
        );
    }
}
