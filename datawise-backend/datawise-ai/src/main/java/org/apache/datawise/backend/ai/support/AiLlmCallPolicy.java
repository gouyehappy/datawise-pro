package org.apache.datawise.backend.ai.support;

import org.apache.datawise.backend.ai.config.AiAnalysisProperties;
import org.apache.datawise.backend.security.UserContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.retry.NonTransientAiException;
import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;

/**
 * LLM 调用重试策略：仅对 transient {@link RuntimeException} 退避重试；
 * {@link NonTransientAiException} 与参数校验错误立即失败。
 * <p>
 * 连续失败达到阈值后按 {@code tenantId|profileId} 打开短时熔断，避免跨租户雪崩。
 * {@link NonTransientAiException}（如坏 API Key）不计入瞬态熔断计数。
 */
@Component
public class AiLlmCallPolicy {

    private static final Logger log = LoggerFactory.getLogger(AiLlmCallPolicy.class);

    private final AiAnalysisProperties analysisProperties;
    private final ConcurrentHashMap<String, CircuitState> circuits = new ConcurrentHashMap<>();
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

    /**
     * Build an isolated circuit key from tenant and profile identity
     * (baseUrl/model/provider fingerprint — not the API key).
     */
    public static String circuitKey(String tenantId, String profileId) {
        String tenant = (tenantId == null || tenantId.isBlank()) ? "_" : tenantId.trim();
        String profile = (profileId == null || profileId.isBlank()) ? "_" : profileId.trim();
        return tenant + "|" + profile;
    }

    /** Circuit key for the current request tenant and a profile identity. */
    public static String circuitKeyForCurrentTenant(String profileId) {
        return circuitKey(UserContext.getTenantId(), profileId);
    }

    public String execute(String phase, Supplier<String> call) {
        return executeForResult(phase, call);
    }

    public String execute(String phase, String circuitKey, Supplier<String> call) {
        return executeForResult(phase, circuitKey, call);
    }

    public <T> T executeForResult(String phase, Supplier<T> call) {
        return executeForResult(phase, circuitKeyForCurrentTenant("_"), call);
    }

    public <T> T executeForResult(String phase, String circuitKey, Supplier<T> call) {
        String key = normalizeCircuitKey(circuitKey);
        ensureCircuitClosed(phase, key);
        boolean acquired = inFlight == null || inFlight.tryAcquire();
        if (!acquired) {
            // Fail fast instead of blocking a request thread on a saturated provider.
            throw new IllegalStateException("LLM concurrency limit reached, retry later: " + phase);
        }
        try {
            return executeWithRetry(phase, key, call);
        } finally {
            if (inFlight != null) {
                inFlight.release();
            }
        }
    }

    private <T> T executeWithRetry(String phase, String circuitKey, Supplier<T> call) {
        int maxAttempts = analysisProperties.getLlm().getMaxAttempts();
        long delayMs = analysisProperties.getLlm().getRetryDelayMs();
        RuntimeException lastFailure = null;

        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                T result = call.get();
                onSuccess(circuitKey);
                return result;
            } catch (NonTransientAiException ex) {
                // Permanent provider/config errors must not open the transient circuit.
                throw ex;
            } catch (IllegalArgumentException ex) {
                throw ex;
            } catch (RuntimeException ex) {
                lastFailure = ex;
                if (attempt >= maxAttempts) {
                    break;
                }
                log.warn(
                        "LLM transient failure phase={} circuit={} attempt={}/{}: {}",
                        phase,
                        circuitKey,
                        attempt,
                        maxAttempts,
                        ex.getMessage()
                );
                sleep(delayMs, attempt);
            }
        }
        onTransientProviderFailure(circuitKey);
        throw lastFailure != null ? lastFailure : new IllegalStateException("LLM call failed: " + phase);
    }

    /** Visible for tests. */
    boolean isCircuitOpen(String circuitKey) {
        CircuitState state = circuits.get(normalizeCircuitKey(circuitKey));
        if (state == null) {
            return false;
        }
        long until = state.openUntilMs.get();
        return until > 0 && System.currentTimeMillis() < until;
    }

    private void ensureCircuitClosed(String phase, String circuitKey) {
        CircuitState state = circuits.get(circuitKey);
        if (state == null) {
            return;
        }
        long until = state.openUntilMs.get();
        if (until > 0 && System.currentTimeMillis() < until) {
            throw new IllegalStateException(
                    "LLM circuit open until " + until + " phase=" + phase + " circuit=" + circuitKey
            );
        }
        if (until > 0) {
            state.openUntilMs.compareAndSet(until, 0);
        }
    }

    private void onSuccess(String circuitKey) {
        CircuitState state = circuits.get(circuitKey);
        if (state == null) {
            return;
        }
        state.consecutiveFailures.set(0);
        state.openUntilMs.set(0);
    }

    private void onTransientProviderFailure(String circuitKey) {
        int threshold = analysisProperties.getLlm().getCircuitFailureThreshold();
        long openMs = analysisProperties.getLlm().getCircuitOpenMs();
        if (threshold <= 0 || openMs <= 0) {
            return;
        }
        CircuitState state = circuits.computeIfAbsent(circuitKey, ignored -> new CircuitState());
        int failures = state.consecutiveFailures.incrementAndGet();
        if (failures >= threshold) {
            long until = System.currentTimeMillis() + openMs;
            state.openUntilMs.set(until);
            state.consecutiveFailures.set(0);
            log.warn(
                    "LLM circuit opened for {}ms after {} consecutive failures circuit={}",
                    openMs,
                    failures,
                    circuitKey
            );
        }
    }

    private static String normalizeCircuitKey(String circuitKey) {
        if (circuitKey == null || circuitKey.isBlank()) {
            return circuitKeyForCurrentTenant("_");
        }
        return circuitKey.trim();
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

    private static final class CircuitState {
        private final AtomicInteger consecutiveFailures = new AtomicInteger();
        private final AtomicLong openUntilMs = new AtomicLong();
    }
}
