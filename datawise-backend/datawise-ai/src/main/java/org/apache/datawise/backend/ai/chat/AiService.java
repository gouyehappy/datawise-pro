package org.apache.datawise.backend.ai.chat;

import org.apache.datawise.backend.ai.domain.AiChatReply;
import org.apache.datawise.backend.ai.domain.AiChatRequest;
import org.apache.datawise.backend.ai.domain.AiDatabaseTargetDto;
import org.apache.datawise.backend.ai.domain.AiLlmProfileDto;
import org.apache.datawise.backend.ai.domain.AiEmbeddingProfileDto;
import org.apache.datawise.backend.ai.domain.AiSqlGenerateReply;
import org.apache.datawise.backend.ai.domain.AiSqlGenerateRequest;
import org.apache.datawise.backend.domain.ConnectionTestResult;
import org.apache.datawise.backend.ai.rag.embedding.AiEmbeddingService;
import org.apache.datawise.backend.ai.rag.embedding.AiEmbeddingServiceFactory;
import org.apache.datawise.backend.ai.support.AiOpenAiErrorMapper;
import org.springframework.ai.retry.NonTransientAiException;
import org.apache.datawise.backend.ai.schema.AiSchemaContextService;
import org.apache.datawise.backend.ai.support.AiAnalysisIntentDetector;
import org.apache.datawise.backend.ai.support.AiCallLogger;
import org.apache.datawise.backend.ai.support.AiLlmCallPolicy;
import org.apache.datawise.backend.ai.support.AiLlmGateway;
import org.apache.datawise.backend.ai.support.AiPromptTemplates;
import org.apache.datawise.backend.ai.schema.AiSqlSchemaContext;
import org.apache.datawise.backend.ai.support.AiSqlSafetyChecker;
import org.apache.datawise.backend.ai.support.AnalysisMockSql;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

@Service
public class AiService {

    private static final Logger log = LoggerFactory.getLogger(AiService.class);

    private final AiLlmGateway aiLlmGateway;
    private final AiSchemaContextService aiSchemaContextService;
    private final AiDataAgentService aiDataAgentService;
    private final AiEmbeddingServiceFactory embeddingServiceFactory;
    private final AiLlmCallPolicy aiLlmCallPolicy;

    public AiService(
            AiLlmGateway aiLlmGateway,
            AiSchemaContextService aiSchemaContextService,
            AiDataAgentService aiDataAgentService,
            AiEmbeddingServiceFactory embeddingServiceFactory,
            AiLlmCallPolicy aiLlmCallPolicy
    ) {
        this.aiLlmGateway = aiLlmGateway;
        this.aiSchemaContextService = aiSchemaContextService;
        this.aiDataAgentService = aiDataAgentService;
        this.embeddingServiceFactory = embeddingServiceFactory;
        this.aiLlmCallPolicy = aiLlmCallPolicy;
    }

    public AiChatReply chat(AiChatRequest request) {
        String prompt = requirePrompt(request.prompt());
        if (AiAnalysisIntentDetector.isAnalysisIntent(prompt, request.targets(), request.analysisContext())) {
            AiCallLogger.logRoute(log, "analysis", "analysis intent with data source scope");
            return aiDataAgentService.analyze(request);
        }

        AiCallLogger.logRoute(log, "chat", "general conversation");
        String scopeHint = buildScopeHint(request.targets());
        if (aiLlmGateway.isMock(request.llm())) {
            AiCallLogger.logRoute(log, "chat-mock", "mock provider");
            return AiChatReply.chat(mockChatReply(prompt, scopeHint));
        }
        String systemPrompt = AiPromptTemplates.renderChatSystemPrompt(scopeHint);
        String reply = aiLlmGateway.complete(request.llm(), systemPrompt, prompt, "chat");
        if (scopeHint != null && !scopeHint.isBlank()) {
            reply = scopeHint + "\n\n" + reply;
        }
        return AiChatReply.chat(reply);
    }

    /**
     * Streaming general chat only. Analysis intents must use {@code /analyze/stream}.
     * Emits scopeHint as the first content chunk when present, then LLM deltas.
     */
    public AiChatReply chatStream(
            AiChatRequest request,
            java.util.function.Consumer<String> onContent,
            java.util.function.Consumer<String> onThinking
    ) {
        String prompt = requirePrompt(request.prompt());
        if (AiAnalysisIntentDetector.isAnalysisIntent(prompt, request.targets(), request.analysisContext())) {
            throw new IllegalArgumentException("use /api/ai/analyze/stream for analysis prompts");
        }
        AiCallLogger.logRoute(log, "chat-stream", "general conversation stream");
        String scopeHint = buildScopeHint(request.targets());
        java.util.function.Consumer<String> contentSink = onContent != null ? onContent : chunk -> {
        };
        java.util.function.Consumer<String> thinkingSink = onThinking != null ? onThinking : chunk -> {
        };

        if (aiLlmGateway.isMock(request.llm())) {
            AiCallLogger.logRoute(log, "chat-stream-mock", "mock provider");
            String reply = mockChatReply(prompt, scopeHint);
            if (!reply.isEmpty()) {
                contentSink.accept(reply);
            }
            return AiChatReply.chat(reply);
        }

        String systemPrompt = AiPromptTemplates.renderChatSystemPrompt(scopeHint);
        boolean[] scopeEmitted = {false};
        String reply = aiLlmGateway.stream(
                request.llm(),
                systemPrompt,
                prompt,
                "chat",
                new AiLlmGateway.StreamListener() {
                    @Override
                    public void onContent(String chunk) {
                        if (!scopeEmitted[0] && scopeHint != null && !scopeHint.isBlank()) {
                            scopeEmitted[0] = true;
                            contentSink.accept(scopeHint + "\n\n");
                        }
                        contentSink.accept(chunk);
                    }

                    @Override
                    public void onThinking(String chunk) {
                        thinkingSink.accept(chunk);
                    }
                }
        );
        if (!scopeEmitted[0] && scopeHint != null && !scopeHint.isBlank()) {
            // Reasoning-only or empty content: still surface scope on the final reply.
            reply = scopeHint + "\n\n" + (reply == null ? "" : reply);
            contentSink.accept(scopeHint + "\n\n");
        } else if (scopeEmitted[0] && scopeHint != null && !scopeHint.isBlank()) {
            reply = scopeHint + "\n\n" + (reply == null ? "" : reply);
        }
        return AiChatReply.chat(reply == null ? "" : reply);
    }

    /**
     * host.ai plugin chat: honor the plugin's system prompt as the real system
     * role (do not fold into the user message) and skip analysis routing.
     */
    public AiChatReply pluginChat(AiLlmProfileDto llm, String systemPrompt, String userPrompt) {
        String prompt = requirePrompt(userPrompt);
        String system = systemPrompt == null || systemPrompt.isBlank()
                ? AiPromptTemplates.renderChatSystemPrompt("")
                : systemPrompt.trim();
        AiCallLogger.logRoute(log, "plugin-chat", "host.ai plugin turn");
        if (aiLlmGateway.isMock(llm)) {
            AiCallLogger.logRoute(log, "plugin-chat-mock", "mock provider");
            return AiChatReply.chat(mockChatReply(prompt, ""));
        }
        String reply = aiLlmGateway.complete(llm, system, prompt, "plugin-chat");
        return AiChatReply.chat(reply == null ? "" : reply);
    }

    /** host.ai streaming chat; {@code onDelta} receives each content chunk. */
    public AiChatReply pluginChatStream(
            AiLlmProfileDto llm,
            String systemPrompt,
            String userPrompt,
            java.util.function.Consumer<String> onDelta
    ) {
        String prompt = requirePrompt(userPrompt);
        String system = systemPrompt == null || systemPrompt.isBlank()
                ? AiPromptTemplates.renderChatSystemPrompt("")
                : systemPrompt.trim();
        AiCallLogger.logRoute(log, "plugin-chat-stream", "host.ai plugin stream turn");
        if (aiLlmGateway.isMock(llm)) {
            AiCallLogger.logRoute(log, "plugin-chat-stream-mock", "mock provider");
            String reply = mockChatReply(prompt, "");
            if (onDelta != null && !reply.isEmpty()) {
                onDelta.accept(reply);
            }
            return AiChatReply.chat(reply);
        }
        String reply = aiLlmGateway.stream(llm, system, prompt, "plugin-chat", onDelta);
        return AiChatReply.chat(reply == null ? "" : reply);
    }

    public AiSqlGenerateReply generateSql(AiSqlGenerateRequest request) {
        String prompt = requirePrompt(request.prompt());
        AiSqlSchemaContext schema = aiSchemaContextService.build(
                request.connectionId(),
                request.database(),
                prompt
        );
        if (aiLlmGateway.isMock(request.llm())) {
            return new AiSqlGenerateReply(AnalysisMockSql.forPrompt(prompt, schema));
        }
        String systemPrompt = AiPromptTemplates.renderSqlSystemPrompt(schema);
        String sql = aiLlmGateway.complete(request.llm(), systemPrompt, prompt, "sql-generate");
        return new AiSqlGenerateReply(AiSqlSafetyChecker.normalizeGeneratedSql(sql));
    }

    public ConnectionTestResult testConnection(AiLlmProfileDto profile) {
        if (aiLlmGateway.isMock(profile)) {
            return new ConnectionTestResult(true, "Mock provider is always available.", 0);
        }
        try {
            String reply = aiLlmGateway.complete(
                    profile,
                    "You are a connectivity test assistant. Reply with the single word OK.",
                    "Reply with OK only.",
                    "test-connection"
            );
            if (reply != null && reply.toLowerCase(Locale.ROOT).contains("ok")) {
                return new ConnectionTestResult(true, "Connection test succeeded.", 0);
            }
            String clipped = reply == null ? "" : reply.substring(0, Math.min(reply.length(), 80));
            return new ConnectionTestResult(true, "Connection test succeeded: " + clipped, 0);
        } catch (RuntimeException ex) {
            return new ConnectionTestResult(false, ex.getMessage(), 0);
        }
    }

    public ConnectionTestResult testEmbedding(AiEmbeddingProfileDto profile) {
        if (profile == null) {
            return new ConnectionTestResult(false, "Embedding profile is required", 0);
        }
        try {
            AiEmbeddingService service = profile.isHashProvider()
                    ? embeddingServiceFactory.createFromProfileOrHash(profile, aiLlmCallPolicy)
                    : embeddingServiceFactory.createFromProfile(profile, aiLlmCallPolicy);
            float[] vector = service.embed("DataWise embedding connectivity test");
            if (vector == null || vector.length == 0) {
                return new ConnectionTestResult(false, "Embedding API returned empty vector", 0);
            }
            return new ConnectionTestResult(
                    true,
                    "Embedding test succeeded (provider="
                            + service.provider()
                            + ", dimensions="
                            + vector.length
                            + ")",
                    0
            );
        } catch (NonTransientAiException ex) {
            return new ConnectionTestResult(
                    false,
                    AiOpenAiErrorMapper.toEmbeddingMessage(
                            profile.baseUrl(),
                            profile.resolvedEmbeddingsPath(),
                            profile.model(),
                            ex.getMessage()
                    ),
                    0
            );
        } catch (RuntimeException ex) {
            return new ConnectionTestResult(false, ex.getMessage(), 0);
        }
    }

    private String requirePrompt(String prompt) {
        if (prompt == null || prompt.isBlank()) {
            throw new IllegalArgumentException("prompt is required");
        }
        return prompt.trim();
    }

    private String buildScopeHint(List<AiDatabaseTargetDto> targets) {
        if (targets == null || targets.isEmpty()) {
            return "";
        }
        String names = targets.stream()
                .map(this::formatTargetLabel)
                .collect(Collectors.joining(", "));
        return "Current scope: " + names;
    }

    private String formatTargetLabel(AiDatabaseTargetDto target) {
        StringBuilder builder = new StringBuilder();
        if (target.connectionLabel() != null && !target.connectionLabel().isBlank()) {
            builder.append(target.connectionLabel());
        }
        if (target.databaseLabel() != null && !target.databaseLabel().isBlank()) {
            if (!builder.isEmpty()) {
                builder.append(" / ");
            }
            builder.append(target.databaseLabel());
        }
        if (target.tableLabel() != null && !target.tableLabel().isBlank()) {
            if (!builder.isEmpty()) {
                builder.append(" / ");
            }
            builder.append(target.tableLabel());
        }
        return builder.toString();
    }

    private String mockChatReply(String prompt, String scopeHint) {
        StringBuilder reply = new StringBuilder();
        if (scopeHint != null && !scopeHint.isBlank()) {
            reply.append(scopeHint).append("\n\n");
        }
        reply.append("This is a mock AI reply for: ").append(prompt);
        return reply.toString();
    }
}
