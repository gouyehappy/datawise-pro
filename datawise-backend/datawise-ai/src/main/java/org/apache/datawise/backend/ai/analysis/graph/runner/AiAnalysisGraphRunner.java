package org.apache.datawise.backend.ai.analysis.graph.runner;

import com.alibaba.cloud.ai.graph.CompiledGraph;
import com.alibaba.cloud.ai.graph.OverAllState;
import com.alibaba.cloud.ai.graph.RunnableConfig;
import com.alibaba.cloud.ai.graph.state.StateSnapshot;
import org.apache.datawise.backend.ai.analysis.AiAnalysisErrorCodes;
import org.apache.datawise.backend.ai.AiException;
import org.apache.datawise.backend.ai.analysis.AiAnalysisSteps;
import org.apache.datawise.backend.common.UnauthorizedException;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.ai.analysis.graph.runtime.AiAnalysisStepContext;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphReplyExtractor;
import org.apache.datawise.backend.ai.analysis.graph.stream.AiAnalysisGraphStreamSupport;
import org.apache.datawise.backend.ai.analysis.policy.AiAnalysisStepPolicy;
import org.apache.datawise.backend.ai.support.AiCallLogger;
import org.apache.datawise.backend.ai.domain.AiAnalysisInterruptPayload;
import org.apache.datawise.backend.ai.domain.AiAnalysisResumeRequest;
import org.apache.datawise.backend.ai.domain.AiAnalysisRunOutcome;
import org.apache.datawise.backend.ai.domain.AiAnalysisStepEvent;
import org.apache.datawise.backend.ai.domain.AiChatReply;
import org.apache.datawise.backend.ai.domain.AiChatRequest;
import org.apache.datawise.backend.ai.service.AgentWriteGrantService;
import org.apache.datawise.backend.security.UserContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;

/**
 * 执行 DataAgent StateGraph 分析流水线（含 interrupt / resume）
 */
@Component
public class AiAnalysisGraphRunner {

    private static final Logger log = LoggerFactory.getLogger(AiAnalysisGraphRunner.class);

    private final CompiledGraph compiledGraph;
    private final AiAnalysisStepPolicy stepPolicy;
    private final AgentWriteGrantService agentWriteGrantService;

    public AiAnalysisGraphRunner(
            CompiledGraph aiAnalysisCompiledGraph,
            AiAnalysisStepPolicy stepPolicy,
            AgentWriteGrantService agentWriteGrantService) {
        this.compiledGraph = aiAnalysisCompiledGraph;
        this.stepPolicy = stepPolicy;
        this.agentWriteGrantService = agentWriteGrantService;
    }

    public AiAnalysisRunOutcome run(
            AiChatRequest request,
            Consumer<AiAnalysisStepEvent> onStep,
            boolean humanInTheLoop
    ) {
        long pipelineStart = System.currentTimeMillis();
        String threadId = UUID.randomUUID().toString();
        RunnableConfig config = RunnableConfig.builder().threadId(threadId).build();
        Map<String, Object> inputs = buildInitialInputs(request);

        return AiAnalysisStepContext.runWith(onStep, () -> {
            try {
                Optional<OverAllState> result = compiledGraph.invoke(inputs, config);
                RunnableConfig latestConfig = AiAnalysisGraphStreamSupport.resolveLatestConfig(compiledGraph, config);
                Optional<AiAnalysisInterruptPayload> interrupt = detectInterrupt(latestConfig);
                if (interrupt.isPresent()) {
                    if (!humanInTheLoop || Boolean.TRUE.equals(request.skipSqlConfirmation())) {
                        return resumeConfirmed(interrupt.get(), pipelineStart);
                    }
                    return AiAnalysisRunOutcome.awaitingConfirmation(interrupt.get());
                }
                AiChatReply reply = extractReply(result, latestConfig);
                logPipelineDone(pipelineStart);
                return AiAnalysisRunOutcome.completed(reply);
            } catch (RuntimeException ex) {
                ExceptionLogging.error(log, "ai.analysis.graph.invoke threadId=" + threadId, ex);
                throw wrapGraphFailure(ex);
            }
        });
    }

    public AiAnalysisRunOutcome resume(AiAnalysisResumeRequest request, Consumer<AiAnalysisStepEvent> onStep) {
        if (!request.approved()) {
            return AiAnalysisRunOutcome.completed(AiChatReply.chat("已取消 SQL 执行。"));
        }
        // T-AI-1: Agent write must present a one-shot exact-SQL grant before resume executes.
        agentWriteGrantService.consume(
                request.grantId(),
                request.confirmedSql(),
                UserContext.requireUserId());
        long pipelineStart = System.currentTimeMillis();
        AiAnalysisInterruptPayload interrupt = new AiAnalysisInterruptPayload(
                request.threadId(),
                request.checkpointId(),
                null,
                AiAnalysisSteps.SQL_EXECUTE
        );
        return AiAnalysisStepContext.runWith(onStep, () -> {
            try {
                AiChatReply reply = resumeConfirmed(interrupt, pipelineStart).reply();
                return AiAnalysisRunOutcome.completed(reply);
            } catch (RuntimeException ex) {
                ExceptionLogging.error(log, "ai.analysis.graph.resume threadId=" + request.threadId(), ex);
                throw wrapGraphFailure(ex, AiAnalysisErrorCodes.GRAPH_RESUME_FAILED, "数据分析恢复失败");
            }
        });
    }

    private AiAnalysisRunOutcome resumeConfirmed(
            AiAnalysisInterruptPayload interrupt,
            long pipelineStart
    ) {
        RunnableConfig config = resolveResumeConfig(interrupt.threadId());
        assertResumeOwnedByCurrentUser(config);
        Map<String, Object> resumeUpdates = new HashMap<>();
        resumeUpdates.put(AiAnalysisGraphKeys.SQL_APPROVED, true);
        String runId = AiAnalysisStepContext.currentRunId();
        if (runId != null) {
            resumeUpdates.put(AiAnalysisGraphKeys.RUN_ID, runId);
        }
        RunnableConfig latestConfig = AiAnalysisGraphStreamSupport.runToCompletion(
                compiledGraph,
                config,
                resumeUpdates
        );

        Optional<AiAnalysisInterruptPayload> stillWaiting = detectInterrupt(latestConfig);
        if (stillWaiting.isPresent()) {
            log.warn(
                    "Analysis graph still interrupted at step={} threadId={} checkpointId={}",
                    stillWaiting.get().nextStep(),
                    stillWaiting.get().threadId(),
                    stillWaiting.get().checkpointId()
            );
            throw new AiException(
                    AiAnalysisErrorCodes.RESUME_STILL_INTERRUPTED,
                    "SQL 已确认但分析图未继续执行，请重试"
            );
        }

        AiChatReply reply = extractReply(Optional.empty(), latestConfig);
        logPipelineDone(pipelineStart);
        return AiAnalysisRunOutcome.completed(reply);
    }

    /**
     * 仅按 threadId 解析 checkpoint saver 中最新 checkpoint，忽略客户端可能过期的 checkpointId
     */
    private RunnableConfig resolveResumeConfig(String threadId) {
        if (threadId == null || threadId.isBlank()) {
            throw new IllegalArgumentException("分析会话 threadId 缺失");
        }
        RunnableConfig threadOnly = RunnableConfig.builder().threadId(threadId).build();
        return AiAnalysisGraphStreamSupport.resolveLatestConfig(compiledGraph, threadOnly);
    }

    private void assertResumeOwnedByCurrentUser(RunnableConfig config) {
        Long currentUserId = UserContext.requireUserId();
        StateSnapshot snapshot = compiledGraph.getState(config);
        Optional<Object> owner = snapshot.state().value(AiAnalysisGraphKeys.USER_ID);
        Long ownerUserId = owner.map(AiAnalysisGraphRunner::asUserId).orElse(null);
        if (ownerUserId == null || !currentUserId.equals(ownerUserId)) {
            throw new IllegalArgumentException("unauthorized resume: analysis session does not belong to the current user");
        }
    }

    private static Long asUserId(Object value) {
        if (value instanceof Long longValue) {
            return longValue;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value instanceof String text && !text.isBlank()) {
            try {
                return Long.parseLong(text.trim());
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    private Optional<AiAnalysisInterruptPayload> detectInterrupt(RunnableConfig config) {
        StateSnapshot snapshot = compiledGraph.getState(config);
        String next = snapshot.next();
        if (!AiAnalysisSteps.SQL_EXECUTE.equals(next)) {
            return Optional.empty();
        }
        String sql = snapshot.state().value(AiAnalysisGraphKeys.SAFE_SQL, "");
        RunnableConfig snapshotConfig = snapshot.config();
        return Optional.of(new AiAnalysisInterruptPayload(
                snapshotConfig.threadId().orElse(config.threadId().orElse("")),
                snapshotConfig.checkPointId().orElse(""),
                sql,
                next
        ));
    }

    private AiChatReply extractReply(Optional<OverAllState> result, RunnableConfig config) {
        if (result.isPresent()) {
            Optional<Object> reply = result.get().value(AiAnalysisGraphKeys.REPLY);
            if (reply.isPresent()) {
                return AiAnalysisGraphReplyExtractor.requireReply(result.get(), stepPolicy);
            }
        }
        StateSnapshot snapshot = compiledGraph.getState(config);
        logResumeState(snapshot);
        return AiAnalysisGraphReplyExtractor.requireReply(snapshot.state(), stepPolicy);
    }

    private void logResumeState(StateSnapshot snapshot) {
        if (!log.isDebugEnabled()) {
            return;
        }
        log.debug(
                "Analysis graph snapshot next={} keys={}",
                snapshot.next(),
                snapshot.state().data().keySet()
        );
    }

    private static Map<String, Object> buildInitialInputs(AiChatRequest request) {
        Map<String, Object> inputs = new HashMap<>();
        inputs.put(AiAnalysisGraphKeys.REQUEST, request);
        UserContext.Snapshot snapshot = UserContext.snapshotOrNull();
        if (snapshot != null) {
            inputs.put(AiAnalysisGraphKeys.USER_ID, snapshot.userId());
            inputs.put(AiAnalysisGraphKeys.USER_GUEST, snapshot.guest());
            if (snapshot.sessionId() != null) {
                inputs.put(AiAnalysisGraphKeys.SESSION_ID, snapshot.sessionId());
            }
        }
        String runId = AiAnalysisStepContext.currentRunId();
        if (runId != null) {
            inputs.put(AiAnalysisGraphKeys.RUN_ID, runId);
        }
        return inputs;
    }

    private static AiException wrapGraphFailure(RuntimeException ex) {
        return wrapGraphFailure(ex, AiAnalysisErrorCodes.GRAPH_INVOKE_FAILED, "数据分析执行失败");
    }

    private static AiException wrapGraphFailure(
            RuntimeException ex,
            String defaultCode,
            String prefix
    ) {
        if (isUnauthorized(ex)) {
            return new AiException(
                    AiAnalysisErrorCodes.SESSION_EXPIRED,
                    "登录会话已失效，请重新登录后再试",
                    ex
            );
        }
        return new AiException(defaultCode, prefix + ": " + rootMessage(ex), ex);
    }

    private void logPipelineDone(long pipelineStart) {
        AiCallLogger.logAnalysisStep(log, "pipeline-done", "durationMs", System.currentTimeMillis() - pipelineStart);
        AiCallLogger.logAnalysisStep(log, "graph-engine", "engine", "StateGraph");
    }

    private static boolean isUnauthorized(Throwable error) {
        Throwable current = error;
        while (current != null) {
            if (current instanceof UnauthorizedException) {
                return true;
            }
            current = current.getCause();
        }
        return UnauthorizedException.CODE.equals(rootMessage(error));
    }

    private static String rootMessage(Throwable error) {
        Throwable root = error;
        while (root.getCause() != null && root.getCause() != root) {
            root = root.getCause();
        }
        String message = root.getMessage();
        return message != null && !message.isBlank() ? message.trim() : root.getClass().getSimpleName();
    }
}
