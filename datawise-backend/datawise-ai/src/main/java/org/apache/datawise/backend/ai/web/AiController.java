package org.apache.datawise.backend.ai.web;

import org.apache.datawise.backend.ai.analysis.stream.AiAnalysisStreamEmitter;
import org.apache.datawise.backend.ai.chat.AiDataAgentService;
import org.apache.datawise.backend.ai.chat.AiService;
import org.apache.datawise.backend.ai.support.AiCallLogger;
import org.apache.datawise.backend.ai.support.UserAiLlmResolver;
import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.ai.domain.AiAnalysisResumeRequest;
import org.apache.datawise.backend.ai.domain.AiAnalysisRunOutcome;
import org.apache.datawise.backend.ai.domain.AiChatReply;
import org.apache.datawise.backend.ai.domain.AiChatRequest;
import org.apache.datawise.backend.ai.domain.AiSqlGenerateReply;
import org.apache.datawise.backend.ai.domain.AiSqlGenerateRequest;
import org.apache.datawise.backend.ai.domain.AiTestConnectionRequest;
import org.apache.datawise.backend.ai.domain.AiTestEmbeddingRequest;
import org.apache.datawise.backend.domain.AiMeterCapabilities;
import org.apache.datawise.backend.domain.ConnectionTestResult;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.common.pack.AiAccessGate;
import org.apache.datawise.backend.service.tenant.TenantQuotaService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import jakarta.validation.Valid;
import java.util.concurrent.CompletableFuture;

@RestController
@RequestMapping("/api/ai")
@ConditionalOnBean(AiService.class)
public class AiController {

    private static final Logger log = LoggerFactory.getLogger(AiController.class);
    private static final Logger auditLog = LoggerFactory.getLogger("datawise.ai.audit");

    private final AiService aiService;
    private final AiDataAgentService aiDataAgentService;
    private final TenantQuotaService tenantQuotaService;
    private final AiAccessGate aiAccessGate;
    private final UserAiLlmResolver userAiLlmResolver;

    public AiController(
            AiService aiService,
            AiDataAgentService aiDataAgentService,
            TenantQuotaService tenantQuotaService,
            AiAccessGate aiAccessGate,
            UserAiLlmResolver userAiLlmResolver
    ) {
        this.aiService = aiService;
        this.aiDataAgentService = aiDataAgentService;
        this.tenantQuotaService = tenantQuotaService;
        this.aiAccessGate = aiAccessGate;
        this.userAiLlmResolver = userAiLlmResolver;
    }

    @PostMapping("/chat")
    public ApiResponse<AiChatReply> chat(@Valid @RequestBody AiChatRequest request) {
        requireAiCall(AiMeterCapabilities.CHAT);
        request = userAiLlmResolver.enrichChatRequest(request);
        int targetCount = request.targets() != null ? request.targets().size() : 0;
        AiCallLogger.logChatEntry(log, request.prompt(), targetCount, request.llm());
        AiCallLogger.logChatEntry(auditLog, request.prompt(), targetCount, request.llm());
        long started = System.currentTimeMillis();
        try {
            AiChatReply reply = aiService.chat(request);
            AiCallLogger.logChatSuccess(log, reply, System.currentTimeMillis() - started);
            AiCallLogger.logChatSuccess(auditLog, reply, System.currentTimeMillis() - started);
            return ApiResponse.ok(reply);
        } catch (RuntimeException ex) {
            AiCallLogger.logChatFailure(log, System.currentTimeMillis() - started, ex);
            AiCallLogger.logChatFailure(auditLog, System.currentTimeMillis() - started, ex);
            throw ex;
        }
    }

    /**
     * SSE general chat: events {@code thinking}, {@code delta}, then {@code result}
     * ({@link AiChatReply} JSON). Analysis prompts must use {@code /analyze/stream}.
     */
    @PostMapping(value = "/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter chatStream(@Valid @RequestBody AiChatRequest request) {
        requireAiCall(AiMeterCapabilities.CHAT);
        AiChatRequest enriched = userAiLlmResolver.enrichChatRequest(request);
        int targetCount = enriched.targets() != null ? enriched.targets().size() : 0;
        AiCallLogger.logChatEntry(log, enriched.prompt(), targetCount, enriched.llm());
        AiCallLogger.logChatEntry(auditLog, enriched.prompt(), targetCount, enriched.llm());
        log.info("AI chat/stream started targets={}", targetCount);
        auditLog.info("AI chat/stream started targets={}", targetCount);

        SseEmitter emitter = new SseEmitter(180_000L);
        UserContext.Snapshot userSnapshot = UserContext.snapshotOrNull();
        CompletableFuture.runAsync(() -> UserContext.runAs(userSnapshot, () -> streamChat(enriched, emitter)));
        return emitter;
    }

    private void streamChat(AiChatRequest request, SseEmitter emitter) {
        long started = System.currentTimeMillis();
        try {
            AiChatReply reply = aiService.chatStream(
                    request,
                    delta -> sendPlainSse(emitter, "delta", delta),
                    thinking -> sendPlainSse(emitter, "thinking", thinking)
            );
            emitter.send(SseEmitter.event().name("result").data(reply, MediaType.APPLICATION_JSON));
            AiCallLogger.logChatSuccess(log, reply, System.currentTimeMillis() - started);
            AiCallLogger.logChatSuccess(auditLog, reply, System.currentTimeMillis() - started);
            emitter.complete();
        } catch (Exception ex) {
            AiCallLogger.logChatFailure(log, System.currentTimeMillis() - started, ex);
            AiCallLogger.logChatFailure(auditLog, System.currentTimeMillis() - started, ex);
            try {
                emitter.send(SseEmitter.event()
                        .name("error")
                        .data(ex.getMessage() == null ? "AI chat stream failed" : ex.getMessage()));
            } catch (Exception ignored) {
                // ignore secondary send failure
            }
            emitter.completeWithError(ex);
        }
    }

    private static void sendPlainSse(SseEmitter emitter, String eventName, String data) {
        if (data == null || data.isEmpty()) {
            return;
        }
        try {
            emitter.send(SseEmitter.event().name(eventName).data(data, MediaType.TEXT_PLAIN));
        } catch (Exception sendEx) {
            throw new RuntimeException(sendEx);
        }
    }

    @PostMapping(value = "/analyze/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter analyzeStream(@Valid @RequestBody AiChatRequest request) {
        requireAiCall(AiMeterCapabilities.ANALYZE);
        AiChatRequest enriched = userAiLlmResolver.enrichChatRequest(request);
        int targetCount = enriched.targets() != null ? enriched.targets().size() : 0;
        AiCallLogger.logChatEntry(log, enriched.prompt(), targetCount, enriched.llm());
        AiCallLogger.logChatEntry(auditLog, enriched.prompt(), targetCount, enriched.llm());
        log.info("AI analyze/stream started targets={}", targetCount);
        auditLog.info("AI analyze/stream started targets={}", targetCount);

        SseEmitter emitter = AiAnalysisStreamEmitter.createEmitter();
        UserContext.Snapshot userSnapshot = UserContext.snapshotOrNull();
        CompletableFuture.runAsync(() -> UserContext.runAs(userSnapshot, () -> streamAnalysis(enriched, emitter)));
        return emitter;
    }

    @PostMapping(value = "/analyze/resume", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter analyzeResume(@Valid @RequestBody AiAnalysisResumeRequest request) {
        // Quota already consumed on /analyze/stream when the run started.
        UserContext.requireUserId();
        log.info("AI analyze/resume threadId={} approved={}", request.threadId(), request.approved());
        auditLog.info("AI analyze/resume threadId={} approved={}", request.threadId(), request.approved());
        SseEmitter emitter = AiAnalysisStreamEmitter.createEmitter();
        UserContext.Snapshot userSnapshot = UserContext.snapshotOrNull();
        CompletableFuture.runAsync(() -> UserContext.runAs(userSnapshot, () -> streamResume(request, emitter)));
        return emitter;
    }

    private void streamAnalysis(AiChatRequest request, SseEmitter emitter) {
        long started = System.currentTimeMillis();
        try {
            AiAnalysisRunOutcome outcome = aiDataAgentService.analyzeStream(
                    request,
                    step -> AiAnalysisStreamEmitter.sendStep(emitter, step)
            );
            if (outcome.awaitingConfirmation()) {
                AiAnalysisStreamEmitter.sendInterrupt(emitter, outcome.interrupt());
                AiAnalysisStreamEmitter.completeSuccess(emitter);
                return;
            }
            AiAnalysisStreamEmitter.sendResult(emitter, outcome.reply());
            AiCallLogger.logChatSuccess(log, outcome.reply(), System.currentTimeMillis() - started);
            AiCallLogger.logChatSuccess(auditLog, outcome.reply(), System.currentTimeMillis() - started);
            AiAnalysisStreamEmitter.completeSuccess(emitter);
        } catch (RuntimeException ex) {
            AiCallLogger.logChatFailure(log, System.currentTimeMillis() - started, ex);
            AiCallLogger.logChatFailure(auditLog, System.currentTimeMillis() - started, ex);
            AiAnalysisStreamEmitter.completeFailure(emitter, ex, log);
        }
    }

    private void streamResume(AiAnalysisResumeRequest request, SseEmitter emitter) {
        long started = System.currentTimeMillis();
        try {
            AiAnalysisRunOutcome outcome = aiDataAgentService.resumeStream(
                    request,
                    step -> AiAnalysisStreamEmitter.sendStep(emitter, step)
            );
            AiAnalysisStreamEmitter.sendResult(emitter, outcome.reply());
            AiCallLogger.logChatSuccess(log, outcome.reply(), System.currentTimeMillis() - started);
            AiCallLogger.logChatSuccess(auditLog, outcome.reply(), System.currentTimeMillis() - started);
            AiAnalysisStreamEmitter.completeSuccess(emitter);
        } catch (RuntimeException ex) {
            AiCallLogger.logChatFailure(log, System.currentTimeMillis() - started, ex);
            AiCallLogger.logChatFailure(auditLog, System.currentTimeMillis() - started, ex);
            AiAnalysisStreamEmitter.completeFailure(emitter, ex, log);
        }
    }

    @PostMapping("/sql/generate")
    public ApiResponse<AiSqlGenerateReply> generateSql(@Valid @RequestBody AiSqlGenerateRequest request) {
        requireAiCall(AiMeterCapabilities.SQL_GENERATE);
        request = userAiLlmResolver.enrichSqlRequest(request);
        AiCallLogger.logSqlGenerateEntry(
                log,
                request.prompt(),
                request.connectionId(),
                request.database(),
                request.llm()
        );
        AiCallLogger.logSqlGenerateEntry(
                auditLog,
                request.prompt(),
                request.connectionId(),
                request.database(),
                request.llm()
        );
        long started = System.currentTimeMillis();
        try {
            AiSqlGenerateReply reply = aiService.generateSql(request);
            AiCallLogger.logSqlGenerateSuccess(log, reply.sql(), System.currentTimeMillis() - started);
            AiCallLogger.logSqlGenerateSuccess(auditLog, reply.sql(), System.currentTimeMillis() - started);
            return ApiResponse.ok(reply);
        } catch (RuntimeException ex) {
            AiCallLogger.logChatFailure(log, System.currentTimeMillis() - started, ex);
            AiCallLogger.logChatFailure(auditLog, System.currentTimeMillis() - started, ex);
            throw ex;
        }
    }

    @PostMapping("/test-connection")
    public ApiResponse<ConnectionTestResult> testConnection(@RequestBody AiTestConnectionRequest request) {
        aiAccessGate.requireAiPack();
        var llm = userAiLlmResolver.fillBlankApiKey(request.llm());
        log.info("AI test-connection provider={}", llm != null ? llm.provider() : "mock");
        return ApiResponse.ok(aiService.testConnection(llm));
    }

    @PostMapping("/test-embedding")
    public ApiResponse<ConnectionTestResult> testEmbedding(@RequestBody AiTestEmbeddingRequest request) {
        aiAccessGate.requireAiPack();
        log.info(
                "AI test-embedding provider={}",
                request.embedding() != null ? request.embedding().provider() : "hash"
        );
        return ApiResponse.ok(aiService.testEmbedding(request.embedding()));
    }

    /**
     * Pack.ai / open -> tenant quota by capability; otherwise consume Standard free daily call.
     */
    private void requireAiCall(String capability) {
        boolean entitled = aiAccessGate.requireAiCallAccess();
        if (entitled) {
            tenantQuotaService.requireAiCallQuota(capability);
        }
    }
}
