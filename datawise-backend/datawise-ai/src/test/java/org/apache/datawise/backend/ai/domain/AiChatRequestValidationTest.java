package org.apache.datawise.backend.ai.domain;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiChatRequestValidationTest {

    private static Validator validator;

    @BeforeAll
    static void setUpValidator() {
        validator = Validation.buildDefaultValidatorFactory().getValidator();
    }

    @Test
    void requiresPrompt() {
        var violations = validator.validate(new AiChatRequest(
                " ",
                List.of(),
                null,
                null,
                false,
                List.of(),
                "smart",
                Map.of()
        ));
        assertEquals(1, violations.size());
        assertEquals("prompt is required", violations.iterator().next().getMessage());
    }

    @Test
    void validPromptPasses() {
        assertTrue(validator.validate(new AiChatRequest(
                "show top tables",
                List.of(),
                null,
                null,
                false
        )).isEmpty());
    }
}
