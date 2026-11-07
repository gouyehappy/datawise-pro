package org.apache.datawise.backend.ai.support;

import org.apache.datawise.backend.ai.config.AiAnalysisProperties;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

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
}
