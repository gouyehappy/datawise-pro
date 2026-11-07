package org.apache.datawise.backend.ai.domain;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiSqlGenerateRequestValidationTest {

    private static Validator validator;

    @BeforeAll
    static void setUpValidator() {
        validator = Validation.buildDefaultValidatorFactory().getValidator();
    }

    @Test
    void requiresPrompt() {
        var violations = validator.validate(new AiSqlGenerateRequest(" ", "c1", "db", null));
        assertEquals(1, violations.size());
        assertEquals("prompt is required", violations.iterator().next().getMessage());
    }

    @Test
    void validPromptPasses() {
        assertTrue(validator.validate(new AiSqlGenerateRequest("count rows", "c1", "db", null)).isEmpty());
    }
}
