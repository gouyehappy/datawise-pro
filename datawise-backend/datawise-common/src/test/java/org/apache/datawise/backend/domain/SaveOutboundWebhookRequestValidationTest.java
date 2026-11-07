package org.apache.datawise.backend.domain;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SaveOutboundWebhookRequestValidationTest {

    private static Validator validator;

    @BeforeAll
    static void setUpValidator() {
        validator = Validation.buildDefaultValidatorFactory().getValidator();
    }

    @Test
    void requiresNameAndUrl() {
        var violations = validator.validate(new SaveOutboundWebhookRequest(
                null,
                " ",
                true,
                "generic",
                null,
                null,
                List.of(),
                null,
                null,
                null,
                null,
                null,
                null,
                null));
        assertEquals(2, violations.size());
        assertTrue(violations.stream().anyMatch(v -> "name is required".equals(v.getMessage())));
        assertTrue(violations.stream().anyMatch(v -> "url is required".equals(v.getMessage())));
    }

    @Test
    void validRequestPasses() {
        assertTrue(validator.validate(new SaveOutboundWebhookRequest(
                null,
                "ops alert",
                true,
                "generic",
                "https://example.com/hook",
                null,
                List.of(),
                null,
                null,
                null,
                null,
                null,
                null,
                null)).isEmpty());
    }
}
