package org.apache.datawise.backend.ai.support;

import org.apache.datawise.backend.ai.config.AiAnalysisProperties;
import org.junit.jupiter.api.Test;
import org.springframework.ai.retry.NonTransientAiException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiLlmCallPolicyTest {

    @Test
    void retriesTransientFailuresUntilSuccess() {
        AiAnalysisProperties properties = new AiAnalysisProperties();
        properties.getLlm().setMaxAttempts(3);
        properties.getLlm().setRetryDelayMs(0);
        AiLlmCallPolicy policy = new AiLlmCallPolicy(properties);

        int[] attempts = {0};
        String reply = policy.execute("test", () -> {
            attempts[0]++;
            if (attempts[0] < 3) {
                throw new IllegalStateException("transient");
            }
            return "ok";
        });

        assertEquals("ok", reply);
        assertEquals(3, attempts[0]);
    }

    @Test
    void doesNotRetryValidationErrors() {
        AiAnalysisProperties properties = new AiAnalysisProperties();
        properties.getLlm().setMaxAttempts(3);
        AiLlmCallPolicy policy = new AiLlmCallPolicy(properties);

        assertThrows(
                IllegalArgumentException.class,
                () -> policy.execute("test", () -> {
                    throw new IllegalArgumentException("bad input");
                })
        );
    }

    @Test
    void opensCircuitAfterConsecutiveFailures() {
        AiAnalysisProperties properties = new AiAnalysisProperties();
        properties.getLlm().setMaxAttempts(1);
        properties.getLlm().setRetryDelayMs(0);
        properties.getLlm().setCircuitFailureThreshold(2);
        properties.getLlm().setCircuitOpenMs(60_000L);
        AiLlmCallPolicy policy = new AiLlmCallPolicy(properties);
        String key = AiLlmCallPolicy.circuitKey("tenant-a", "profile-1");

        assertThrows(IllegalStateException.class, () -> policy.execute("a", key, () -> {
            throw new IllegalStateException("down");
        }));
        assertFalse(policy.isCircuitOpen(key));

        assertThrows(IllegalStateException.class, () -> policy.execute("b", key, () -> {
            throw new IllegalStateException("down");
        }));
        assertTrue(policy.isCircuitOpen(key));

        assertThrows(IllegalStateException.class, () -> policy.execute("c", key, () -> "should-not-run"));
    }

    @Test
    void circuitIsIsolatedPerTenantAndProfile() {
        AiAnalysisProperties properties = new AiAnalysisProperties();
        properties.getLlm().setMaxAttempts(1);
        properties.getLlm().setRetryDelayMs(0);
        properties.getLlm().setCircuitFailureThreshold(1);
        properties.getLlm().setCircuitOpenMs(60_000L);
        AiLlmCallPolicy policy = new AiLlmCallPolicy(properties);

        String bad = AiLlmCallPolicy.circuitKey("tenant-a", "profile-bad");
        String otherTenant = AiLlmCallPolicy.circuitKey("tenant-b", "profile-bad");
        String otherProfile = AiLlmCallPolicy.circuitKey("tenant-a", "profile-ok");

        assertThrows(IllegalStateException.class, () -> policy.execute("a", bad, () -> {
            throw new IllegalStateException("down");
        }));
        assertTrue(policy.isCircuitOpen(bad));
        assertFalse(policy.isCircuitOpen(otherTenant));
        assertFalse(policy.isCircuitOpen(otherProfile));

        assertEquals("ok", policy.execute("b", otherTenant, () -> "ok"));
        assertEquals("ok", policy.execute("c", otherProfile, () -> "ok"));
    }

    @Test
    void nonTransientFailureDoesNotOpenCircuit() {
        AiAnalysisProperties properties = new AiAnalysisProperties();
        properties.getLlm().setMaxAttempts(1);
        properties.getLlm().setRetryDelayMs(0);
        properties.getLlm().setCircuitFailureThreshold(1);
        properties.getLlm().setCircuitOpenMs(60_000L);
        AiLlmCallPolicy policy = new AiLlmCallPolicy(properties);
        String key = AiLlmCallPolicy.circuitKey("tenant-a", "profile-1");

        assertThrows(NonTransientAiException.class, () -> policy.execute("a", key, () -> {
            throw new NonTransientAiException("bad api key");
        }));
        assertFalse(policy.isCircuitOpen(key));

        assertEquals("ok", policy.execute("b", key, () -> "ok"));
    }
}
