package org.apache.datawise.backend.ai.support;

import org.apache.datawise.backend.ai.config.AiAnalysisProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.retry.NonTransientAiException;
import org.springframework.stereotype.Component;

import java.util.function.Supplier;

/**
 * LLM 调用重试策略：仅对 transient {@link RuntimeException} 退避重试；
 * {@link NonTransientAiException} 与参数校验错误立即失败。
 */
@Component
public class AiLlmCallPolicy {

    private static final Logger log = LoggerFactory.getLogger(AiLlmCallPolicy.class);

    private final AiAnalysisProperties analysisProperties;

    public AiLlmCallPolicy(AiAnalysisProperties analysisProperties) {
        this.analysisProperties = analysisProperties;
    }

    public int timeoutSeconds() {
        return analysisProperties.getLlm().getTimeoutSeconds();
    }

    public String execute(String phase, Supplier<String> call) {
        return executeForResult(phase, call);
    }

    public <T> T executeForResult(String phase, Supplier<T> call) {
        int maxAttempts = analysisProperties.getLlm().getMaxAttempts();
        long delayMs = analysisProperties.getLlm().getRetryDelayMs();
        RuntimeException lastFailure = null;

        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return call.get();
            } catch (NonTransientAiException ex) {
                throw ex;
            } catch (IllegalArgumentException ex) {
                throw ex;
            } catch (RuntimeException ex) {
                lastFailure = ex;
                if (attempt >= maxAttempts) {
                    break;
                }
                log.warn(
                        "LLM transient failure phase={} attempt={}/{}: {}",
                        phase,
                        attempt,
                        maxAttempts,
                        ex.getMessage()
                );
                sleep(delayMs);
            }
        }
        throw lastFailure != null ? lastFailure : new IllegalStateException("LLM call failed: " + phase);
    }

    private static void sleep(long delayMs) {
        if (delayMs <= 0) {
            return;
        }
        try {
            Thread.sleep(delayMs);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("LLM retry interrupted", ex);
        }
    }
}
