package org.apache.datawise.backend.ai.analysis.graph.stream;

import com.alibaba.cloud.ai.graph.CompiledGraph;
import com.alibaba.cloud.ai.graph.NodeOutput;
import com.alibaba.cloud.ai.graph.OverAllState;
import com.alibaba.cloud.ai.graph.RunnableConfig;
import com.alibaba.cloud.ai.graph.state.StateSnapshot;
import org.apache.datawise.backend.ai.analysis.AiAnalysisErrorCodes;
import org.apache.datawise.backend.ai.AiException;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphStateFactory;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.bsc.async.AsyncGenerator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

/**
 * 消费 StateGraph stream 直至结束
 */
public final class AiAnalysisGraphStreamSupport {

    private static final Logger log = LoggerFactory.getLogger(AiAnalysisGraphStreamSupport.class);

    private AiAnalysisGraphStreamSupport() {
    }

    public static RunnableConfig runToCompletion(
            CompiledGraph graph,
            RunnableConfig config,
            Map<String, Object> stateUpdates
    ) {
        try {
            RunnableConfig latestConfig = resolveLatestConfig(graph, config);
            if (stateUpdates != null && !stateUpdates.isEmpty()) {
                latestConfig = graph.updateState(latestConfig, stateUpdates, null);
            }

            RunnableConfig threadConfig = threadOnlyConfig(latestConfig);
            StateSnapshot snapshot = graph.getState(threadConfig);
            OverAllState resumeState = AiAnalysisGraphStateFactory.fromCheckpointData(
                    new HashMap<>(snapshot.state().data())
            );
            resumeState.withResume();

            // 必须用 isResume 路径续跑；stream(emptyMap, config) 会从 START 重跑并触发 checkpoint 丢失
            AsyncGenerator<NodeOutput> generator = graph.stream(resumeState, threadConfig);
            for (NodeOutput ignored : generator) {
                /* drain until graph completes or interrupts again */
            }
            return resolveLatestConfig(graph, threadConfig);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            ExceptionLogging.error(log, "Analysis StateGraph stream interrupted", ex);
            throw new AiException(
                    AiAnalysisErrorCodes.STREAM_FAILED,
                    "Analysis StateGraph stream interrupted",
                    ex
            );
        } catch (Exception ex) {
            if (isInterrupted(ex)) {
                Thread.currentThread().interrupt();
            }
            ExceptionLogging.error(log, "Analysis StateGraph stream failed", ex);
            throw new AiException(
                    AiAnalysisErrorCodes.STREAM_FAILED,
                    "Analysis StateGraph stream failed",
                    ex
            );
        }
    }

    private static boolean isInterrupted(Throwable ex) {
        Throwable current = ex;
        while (current != null) {
            if (current instanceof InterruptedException) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }

    /**
     * 始终从 checkpoint saver 取 thread 上最新 checkpoint，避免客户端携带过期 checkpointId
     */
    public static RunnableConfig resolveLatestConfig(CompiledGraph graph, RunnableConfig config) {
        RunnableConfig threadConfig = threadOnlyConfig(config);
        StateSnapshot snapshot = graph.getState(threadConfig);
        if (snapshot == null || snapshot.state() == null) {
            throw new AiException(
                    AiAnalysisErrorCodes.SESSION_EXPIRED,
                    "分析会话已过期，请重新发起分析"
            );
        }
        return snapshot.config();
    }

    private static RunnableConfig threadOnlyConfig(RunnableConfig config) {
        String threadId = config.threadId()
                .orElseThrow(() -> new AiException(
                        AiAnalysisErrorCodes.SESSION_EXPIRED,
                        "分析会话缺少 threadId"
                ));
        return RunnableConfig.builder().threadId(threadId).build();
    }
}
