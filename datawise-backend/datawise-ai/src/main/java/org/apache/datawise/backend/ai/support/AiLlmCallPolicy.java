package org.apache.datawise.backend.ai.support;

import org.apache.datawise.backend.ai.config.AiAnalysisProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.retry.NonTransientAiException;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;

/**
 * LLM 调用重试策略：仅对 transient {@link RuntimeException} 退避重试；
 * {@link NonTransientAiException} 与参数校验错误立即失败。
 * <p>
 * 连续失败达到阈值后打开短时熔断，避免雪崩打满上游配额。
 */
@Component
public class AiLlmCallPolicy {

    private static final Logger log = LoggerFactory.getLogger(AiLlmCallPolicy.class);

    private final AiAnalysisProperties analysisProperties;
    private final AtomicInteger consecutiveFailures = new AtomicInteger();
    private final AtomicLong circuitOpenUntilMs = new AtomicLong();
    /** Bounds in-flight provider calls so retry sleeps cannot pile up unbounded. */
    private final java.util.concurrent.Semaphore inFlight;

    public AiLlmCallPolicy(AiAnalysisProperties analysisProperties) {
        this.analysisProperties = analysisProperties;
        int maxConcurrent = analysisProperties.getLlm().getMaxConcurrentCalls();
        this.inFlight = maxConcurrent > 0 ? new java.util.concurrent.Semaphore(maxConcurrent) : null;
    }

    public int timeoutSeconds() {
        return analysisProperties.getLlm().getTimeoutSeconds();
    }

    public String execute(String phase, Supplier<String> call) {
        return executeForResult(phase, call);
    }

    public <T> T executeForResult(String phase, Supplier<T> call) {
        ensureCircuitClosed(phase);
        boolean acquired = inFlight == null || inFlight.tryAcquire();
        if (!acquired) {
            // Fail fast instead of blocking a request thread on a saturated provider.
            throw new IllegalStateException("LLM concurrency limit reached, retry later: " + phase);
        }
        try {
            return executeWithRetry(phase, call);
        } finally {
            if (inFlight != null) {
                inFlight.release();
            }
        }
    }

    private <T> T executeWithRetry(String phase, Supplier<T> call) {
        int maxAttempts = analysisProperties.getLlm().getMaxAttempts();
        long delayMs = analysisProperties.getLlm().getRetryDelayMs();
        RuntimeException lastFailure = null;

        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                T result = call.get();
                onSuccess();
                return result;
            } catch (NonTransientAiException ex) {
                onProviderFailure();
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
                sleep(delayMs, attempt);
            }
        }
        onProviderFailure();
        throw lastFailure != null ? lastFailure : new IllegalStateException("LLM call failed: " + phase);
    }

    /** Visible for tests. */
    boolean isCircuitOpen() {
        long until = circuitOpenUntilMs.get();
        return until > 0 && System.currentTimeMillis() < until;
    }

    private void ensureCircuitClosed(String phase) {
        long until = circuitOpenUntilMs.get();
        if (until > 0 && System.currentTimeMillis() < until) {
            throw new IllegalStateException(
                    "LLM circuit open until " + until + " phase=" + phase
            );
        }
        if (until > 0) {
            circuitOpenUntilMs.compareAndSet(until, 0);
        }
    }

    private void onSuccess() {
        consecutiveFailures.set(0);
        circuitOpenUntilMs.set(0);
    }

    private void onProviderFailure() {
        int threshold = analysisProperties.getLlm().getCircuitFailureThreshold();
        long openMs = analysisProperties.getLlm().getCircuitOpenMs();
        if (threshold <= 0 || openMs <= 0) {
            return;
        }
        int failures = consecutiveFailures.incrementAndGet();
        if (failures >= threshold) {
            long until = System.currentTimeMillis() + openMs;
            circuitOpenUntilMs.set(until);
            consecutiveFailures.set(0);
            log.warn("LLM circuit opened for {}ms after {} consecutive failures", openMs, failures);
        }
    }

    private static void sleep(long delayMs, int attempt) {
        if (delayMs <= 0) {
            return;
        }
        // Full jitter: spread retries so concurrent callers do not stampede the provider.
        long jittered = delayMs + (long) (Math.random() * delayMs * attempt);
        try {
            Thread.sleep(Math.min(jittered, 5_000L));
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("LLM retry interrupted", ex);
        }
    }
}
