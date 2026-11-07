package org.apache.datawise.backend.ai.federated;

import org.apache.datawise.backend.ai.domain.AiLlmProfileDto;
import org.apache.datawise.backend.ai.schema.AiSchemaContextService;
import org.apache.datawise.backend.ai.schema.AiTableDdlSnippet;
import org.apache.datawise.backend.ai.support.AiLlmGateway;
import org.apache.datawise.backend.ai.support.AiSqlSafetyChecker;
import org.apache.datawise.backend.ai.support.UserAiLlmResolver;
import org.apache.datawise.backend.ai.support.prompt.FederatedSqlPromptTemplates;
import org.apache.datawise.backend.ai.support.prompt.FederatedSqlPromptTemplates.FederatedSourceSchema;
import org.apache.datawise.backend.domain.GenerateFederatedSqlRequest;
import org.apache.datawise.backend.domain.GenerateFederatedSqlResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.FederatedViewSource;
import org.apache.datawise.backend.service.ConnectionVisibilityService;
import org.apache.datawise.sqlparser.SqlTransformOps;
import org.apache.datawise.backend.database.federated.FederatedSqlGenerator;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class FederatedSqlGeneratorService implements FederatedSqlGenerator {

    private final AiLlmGateway aiLlmGateway;
    private final AiSchemaContextService schemaContextService;
    private final UserAiLlmResolver llmResolver;
    private final ConnectionVisibilityService connectionVisibilityService;

    public FederatedSqlGeneratorService(
            AiLlmGateway aiLlmGateway,
            AiSchemaContextService schemaContextService,
            UserAiLlmResolver llmResolver,
            ConnectionVisibilityService connectionVisibilityService
    ) {
        this.aiLlmGateway = aiLlmGateway;
        this.schemaContextService = schemaContextService;
        this.llmResolver = llmResolver;
        this.connectionVisibilityService = connectionVisibilityService;
    }

    public GenerateFederatedSqlResult generate(GenerateFederatedSqlRequest request) {
        if (request.prompt() == null || request.prompt().isBlank()) {
            throw new IllegalArgumentException("prompt is required");
        }
        if (request.sources() == null || request.sources().size() < 2) {
            throw new IllegalArgumentException("at least two sources are required");
        }
        Map<String, FederatedSourceSchema> schemas = loadSourceSchemas(request.sources());
        Optional<AiLlmProfileDto> llm = llmResolver.resolveForCurrentUser();
        String sql;
        if (llm.isEmpty() || aiLlmGateway.isMock(llm.get())) {
            sql = mockFederatedSql(request.prompt(), request.sources(), schemas);
        } else {
            String systemPrompt = FederatedSqlPromptTemplates.renderSystemPrompt();
            String userPrompt = FederatedSqlPromptTemplates.renderUserPrompt(request.prompt(), schemas);
            sql = AiSqlSafetyChecker.normalizeGeneratedSql(
                    aiLlmGateway.complete(llm.get(), systemPrompt, userPrompt, "federated-sql-generate")
            );
        }
        if (sql == null || sql.isBlank()) {
            throw new IllegalArgumentException("failed to generate federated SQL");
        }
        return new GenerateFederatedSqlResult(sql, "AI generated federated view SQL");
    }

    private Map<String, FederatedSourceSchema> loadSourceSchemas(List<FederatedViewSource> sources) {
        Map<String, FederatedSourceSchema> result = new LinkedHashMap<>();
        for (FederatedViewSource source : sources) {
            if (source.getAlias() == null || source.getAlias().isBlank()) {
                throw new IllegalArgumentException("source alias is required");
            }
            if (source.getConnectionId() == null || source.getConnectionId().isBlank()) {
                throw new IllegalArgumentException("source connectionId is required for @" + source.getAlias());
            }
            String alias = source.getAlias().trim();
            ConnectionEntity entity = connectionVisibilityService.resolveConnectionEntity(source.getConnectionId())
                    .orElseThrow(() -> new IllegalArgumentException("connection not found: " + source.getConnectionId()));
            String database = source.getDatabase();
            List<String> tables = schemaContextService.listTableNames(source.getConnectionId(), database);
            List<String> ddlSnippets = new ArrayList<>();
            try {
                var context = schemaContextService.buildForTables(
                        source.getConnectionId(),
                        database,
                        tables.size() > 8 ? tables.subList(0, 8) : tables,
                        null
                );
                if (context.tableDdls() != null) {
                    for (AiTableDdlSnippet snippet : context.tableDdls()) {
                        ddlSnippets.add("-- " + snippet.table() + "\n" + snippet.ddl());
                    }
                }
            } catch (RuntimeException ignored) {
                // schema optional for generation
            }
            result.put(alias, FederatedSourceSchema.from(
                    source,
                    entity.getName(),
                    entity.getDbType(),
                    tables,
                    ddlSnippets
            ));
        }
        return result;
    }

    static String mockFederatedSql(
            String prompt,
            List<FederatedViewSource> sources,
            Map<String, FederatedSourceSchema> schemas
    ) {
        if (sources.size() < 2) {
            return "-- AI federated: " + prompt + "\nSELECT 1";
        }
        FederatedViewSource first = sources.get(0);
        FederatedViewSource second = sources.get(1);
        String a = first.getAlias().trim();
        String b = second.getAlias().trim();
        String tableA = firstTable(schemas.get(a));
        String tableB = firstTable(schemas.get(b));
        return String.join("\n",
                "-- AI federated: " + prompt,
                "SELECT a.*, b.*",
                "FROM (" + SqlTransformOps.limitIfAbsent(SqlTransformOps.selectAllFrom(tableA), 100) + ") @" + a + " a",
                "JOIN (" + SqlTransformOps.limitIfAbsent(SqlTransformOps.selectAllFrom(tableB), 100) + ") @" + b + " b ON 1 = 1"
        );
    }

    private static String firstTable(FederatedSourceSchema schema) {
        if (schema != null && schema.tables() != null && !schema.tables().isEmpty()) {
            return schema.tables().get(0);
        }
        return "dual";
    }
}
