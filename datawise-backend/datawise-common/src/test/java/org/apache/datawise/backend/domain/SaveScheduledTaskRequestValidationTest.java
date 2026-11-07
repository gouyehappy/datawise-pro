package org.apache.datawise.backend.domain;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SaveScheduledTaskRequestValidationTest {

    private static Validator validator;

    @BeforeAll
    static void setUpValidator() {
        validator = Validation.buildDefaultValidatorFactory().getValidator();
    }

    @Test
    void requiresName() {
        var violations = validator.validate(new SaveScheduledTaskRequest(
                null,
                " ",
                "sql",
                "0 * * * * *",
                "{}",
                true));
        assertEquals(1, violations.size());
        assertEquals("name is required", violations.iterator().next().getMessage());
    }

    @Test
    void validNamePasses() {
        assertTrue(validator.validate(new SaveScheduledTaskRequest(
                null,
                "nightly check",
                "sql",
                "0 * * * * *",
                "{}",
                true)).isEmpty());
    }
}
