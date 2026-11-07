package org.apache.datawise.backend.ai.domain;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiAnalysisResumeRequestValidationTest {

    private static Validator validator;

    @BeforeAll
    static void setUpValidator() {
        validator = Validation.buildDefaultValidatorFactory().getValidator();
    }

    @Test
    void requiresThreadId() {
        var violations = validator.validate(new AiAnalysisResumeRequest(" ", "cp-1", true));
        assertEquals(1, violations.size());
        assertEquals("threadId is required", violations.iterator().next().getMessage());
    }

    @Test
    void validRequestPasses() {
        assertTrue(validator.validate(new AiAnalysisResumeRequest("thread-1", null, false)).isEmpty());
    }
}
