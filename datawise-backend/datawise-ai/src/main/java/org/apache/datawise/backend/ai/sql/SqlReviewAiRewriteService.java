package org.apache.datawise.backend.ai.sql;

import org.apache.datawise.backend.ai.domain.AiLlmProfileDto;
import org.apache.datawise.backend.ai.schema.AiSchemaContextService;
import org.apache.datawise.backend.ai.schema.AiSqlSchemaContext;
import org.apache.datawise.backend.ai.support.AiLlmGateway;
import org.apache.datawise.backend.ai.support.AiSqlSafetyChecker;
import org.apache.datawise.sqlparser.SqlTransformOps;
import org.apache.datawise.backend.ai.support.UserAiLlmResolver;
import org.apache.datawise.backend.ai.support.prompt.SqlReviewPromptTemplates;
import org.apache.datawise.backend.domain.SqlReviewFindingDto;
import org.apache.datawise.backend.domain.SqlReviewRequest;
import org.apache.datawise.backend.domain.SqlReviewResultDto;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Locale;
import java.util.Optional;

@Service
public class SqlReviewAiRewriteService {

    private final AiLlmGateway aiLlmGateway;
    private final AiSchemaContextService schemaContextService;
    private final UserAiLlmResolver llmResolver;

    public SqlReviewAiRewriteService(
            AiLlmGateway aiLlmGateway,
            AiSchemaContextService schemaContextService,
            UserAiLlmResolver llmResolver
    ) {
        this.aiLlmGateway = aiLlmGateway;
        this.schemaContextService = schemaContextService;
        this.llmResolver = llmResolver;
    }

    public SqlReviewResultDto enrich(SqlReviewRequest request, SqlReviewResultDto base) {
        if (base.findings() == null || base.findings().isEmpty()) {
            return base;
        }
        Optional<String> rewrite = suggestRewrite(request, base.findings());
        if (rewrite.isEmpty()) {
            return base;
        }
        return new SqlReviewResultDto(
                base.allowed(),
                base.requiresApproval(),
                base.findings(),
                rewrite.get(),
                rewriteNote(base.findings())
        );
    }

    private Optional<String> suggestRewrite(SqlReviewRequest request, List<SqlReviewFindingDto> findings) {
        String sql = request.sql() != null ? request.sql().trim() : "";
        if (sql.isBlank()) {
            return Optional.empty();
        }
        AiSqlSchemaContext schema = buildSchema(request);
        Optional<AiLlmProfileDto> llm = llmResolver.resolveForCurrentUser();
        if (llm.isEmpty() || aiLlmGateway.isMock(llm.get())) {
            return Optional.of(mockRewrite(sql, findings, schema));
        }
        String systemPrompt = SqlReviewPromptTemplates.renderRewriteSystemPrompt(schema);
        String userPrompt = SqlReviewPromptTemplates.renderRewriteUserPrompt(sql, findings);
        String rewritten = aiLlmGateway.complete(llm.get(), systemPrompt, userPrompt, "sql-review-rewrite");
        String normalized = AiSqlSafetyChecker.normalizeGeneratedSql(rewritten);
        if (normalized == null || normalized.isBlank()) {
            return Optional.empty();
        }
        return Optional.of(normalized);
    }

    private AiSqlSchemaContext buildSchema(SqlReviewRequest request) {
        if (request.connectionId() == null || request.connectionId().isBlank()) {
            return null;
        }
        try {
            return schemaContextService.build(
                    request.connectionId(),
                    request.database(),
                    request.sql()
            );
        } catch (RuntimeException ex) {
            return null;
        }
    }

    static String mockRewrite(String sql, List<SqlReviewFindingDto> findings, AiSqlSchemaContext schema) {
        String result = sql;
        for (SqlReviewFindingDto finding : findings) {
            result = applyMockFix(result, finding, schema);
        }
        if (result.equals(sql)) {
            return "-- AI rewrite: review findings noted\n" + sql;
        }
        return result;
    }

    private static String applyMockFix(String sql, SqlReviewFindingDto finding, AiSqlSchemaContext schema) {
        String upper = sql.toUpperCase(Locale.ROOT);
        return switch (finding.code()) {
            case "MISSING_WHERE" -> {
                if ((upper.startsWith("DELETE ") || upper.startsWith("UPDATE ")) && !upper.contains(" WHERE ")) {
                    yield sql.trim() + " WHERE 1 = 0 -- AI: add predicate before production run";
                }
                yield sql;
            }
            case "SELECT_STAR" -> {
                if (upper.contains("SELECT *")) {
                    String cols = firstTableColumns(schema);
                    if (cols != null) {
                        yield SqlTransformOps.replaceSelectStar(sql, cols.split(",\\s*"));
                    }
                }
                yield sql;
            }
            case "FULL_SCAN" -> {
                if ((upper.startsWith("SELECT ") || upper.startsWith("WITH "))
                        && !upper.contains(" LIMIT ") && !upper.contains(" WHERE ")) {
                    yield SqlTransformOps.limitIfAbsent(sql.trim(), 1000) + " -- AI: cap result set";
                }
                yield sql;
            }
            default -> sql;
        };
    }

    private static String firstTableColumns(AiSqlSchemaContext schema) {
        if (schema == null || schema.tableDdls() == null || schema.tableDdls().isEmpty()) {
            return null;
        }
        String ddl = schema.tableDdls().get(0).ddl();
        if (ddl == null) {
            return null;
        }
        int open = ddl.indexOf('(');
        int close = ddl.indexOf(')', open + 1);
        if (open < 0 || close <= open) {
            return null;
        }
        String body = ddl.substring(open + 1, close);
        String[] parts = body.split(",");
        List<String> names = new java.util.ArrayList<>();
        for (String part : parts) {
            String token = part.trim().split("\\s+")[0].replace("`", "").replace("\"", "");
            if (!token.isBlank() && !token.equalsIgnoreCase("PRIMARY") && !token.equalsIgnoreCase("KEY")
                    && !token.equalsIgnoreCase("CONSTRAINT") && !token.equalsIgnoreCase("UNIQUE")) {
                names.add(token);
                if (names.size() >= 5) {
                    break;
                }
            }
        }
        return names.isEmpty() ? null : String.join(", ", names);
    }

    private static String rewriteNote(List<SqlReviewFindingDto> findings) {
        long errors = findings.stream().filter(f -> "error".equals(f.severity())).count();
        long warns = findings.stream().filter(f -> "warn".equals(f.severity())).count();
        if (errors > 0) {
            return "AI suggested a safer rewrite for " + errors + " blocking issue(s).";
        }
        if (warns > 0) {
            return "AI suggested improvements for " + warns + " warning(s).";
        }
        return "AI rewrite suggestion.";
    }
}
