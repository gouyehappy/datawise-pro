package org.apache.datawise.backend.domain;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SaveSchemaDriftMonitorRequestValidationTest {

    private static Validator validator;

    @BeforeAll
    static void setUpValidator() {
        validator = Validation.buildDefaultValidatorFactory().getValidator();
    }

    @Test
    void requiresNameAndConnectionIds() {
        var violations = validator.validate(new SaveSchemaDriftMonitorRequest(
                null,
                " ",
                null,
                "db",
                " ",
                "db",
                null,
                true));
        assertEquals(3, violations.size());
        assertTrue(violations.stream().anyMatch(v -> "name is required".equals(v.getMessage())));
        assertTrue(violations.stream().anyMatch(v -> "sourceConnectionId is required".equals(v.getMessage())));
        assertTrue(violations.stream().anyMatch(v -> "targetConnectionId is required".equals(v.getMessage())));
    }

    @Test
    void validRequestPasses() {
        assertTrue(validator.validate(new SaveSchemaDriftMonitorRequest(
                null,
                "prod vs stg",
                "conn-1",
                "app",
                "conn-2",
                "app",
                "user_*",
                true)).isEmpty());
    }
}
