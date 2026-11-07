package org.apache.datawise.backend.ai.eval;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.util.List;
import java.util.Locale;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

/**
 * Offline Text-to-SQL golden-set harness.
 * <p>
 * Cases live in {@code ai-eval/golden-text-to-sql.json}. Each case can supply an
 * {@code expectedSql} (scored structurally) or rely on mustContain / mustNotContain
 * heuristics when validating candidate SQL from a future LLM/fixture runner.
 * <p>
 * Run: {@code mvn -pl datawise-ai test -Dtest=TextToSqlEvalHarnessTest}
 */
class TextToSqlEvalHarnessTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    record GoldenCase(
            String id,
            String dialect,
            String question,
            List<String> schemaTables,
            List<String> mustContain,
            List<String> mustNotContain,
            String expectedSql
    ) {
    }

    @Test
    void goldenSetLoadsAndFixtureSqlPassesHeuristics() throws Exception {
        List<GoldenCase> cases = loadCases();
        assertFalse(cases.isEmpty(), "golden set must not be empty");

        int passed = 0;
        for (GoldenCase c : cases) {
            String candidate = c.expectedSql() != null && !c.expectedSql().isBlank()
                    ? c.expectedSql()
                    : synthesizeFixtureSql(c);
            Score score = score(c, candidate);
            if (!score.passed()) {
                fail("case " + c.id() + " failed: " + score.reason());
            }
            passed++;
        }
        assertTrue(passed == cases.size());
    }

    @Test
    void rejectsDestructiveSql() throws Exception {
        GoldenCase c = loadCases().get(0);
        Score score = score(c, "DELETE FROM orders");
        assertFalse(score.passed());
    }

    private static List<GoldenCase> loadCases() throws Exception {
        try (InputStream in = TextToSqlEvalHarnessTest.class.getResourceAsStream(
                "/ai-eval/golden-text-to-sql.json")) {
            if (in == null) {
                fail("missing classpath resource /ai-eval/golden-text-to-sql.json");
            }
            return MAPPER.readValue(in, new TypeReference<>() {
            });
        }
    }

    private static String synthesizeFixtureSql(GoldenCase c) {
        String table = c.schemaTables() != null && !c.schemaTables().isEmpty()
                ? c.schemaTables().get(0)
                : "t";
        String q = c.question() != null ? c.question().toLowerCase(Locale.ROOT) : "";
        if (q.contains("多少") || q.contains("count") || q.contains("统计")) {
            return "SELECT COUNT(*) AS cnt FROM " + table;
        }
        if (q.contains("status")) {
            return "SELECT * FROM " + table + " WHERE status = 'active'";
        }
        return "SELECT * FROM " + table;
    }

    private static Score score(GoldenCase c, String sql) {
        if (sql == null || sql.isBlank()) {
            return Score.fail("empty sql");
        }
        String upper = sql.toUpperCase(Locale.ROOT);
        if (c.mustContain() != null) {
            for (String token : c.mustContain()) {
                if (token != null && !token.isBlank() && !upper.contains(token.toUpperCase(Locale.ROOT))) {
                    return Score.fail("missing token: " + token);
                }
            }
        }
        if (c.mustNotContain() != null) {
            for (String token : c.mustNotContain()) {
                if (token != null && !token.isBlank() && upper.contains(token.toUpperCase(Locale.ROOT))) {
                    return Score.fail("forbidden token: " + token);
                }
            }
        }
        if (c.expectedSql() != null && !c.expectedSql().isBlank()) {
            String normalizedExpected = normalize(c.expectedSql());
            String normalizedActual = normalize(sql);
            if (!normalizedExpected.equals(normalizedActual)) {
                return Score.fail("expectedSql mismatch");
            }
        }
        return Score.pass();
    }

    private static String normalize(String sql) {
        return sql.replaceAll("\\s+", " ").trim().toUpperCase(Locale.ROOT);
    }

    private record Score(boolean passed, String reason) {
        static Score pass() {
            return new Score(true, "");
        }

        static Score fail(String reason) {
            return new Score(false, reason);
        }
    }
}
