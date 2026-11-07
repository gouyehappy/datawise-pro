package org.apache.datawise.backend.domain;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SqlRequestValidationTest {

    private static Validator validator;

    @BeforeAll
    static void setUpValidator() {
        validator = Validation.buildDefaultValidatorFactory().getValidator();
    }

    @Test
    void sessionRequestRequiresKeys() {
        var violations = validator.validate(new SqlSessionRequest(" ", null, "db"));
        assertEquals(2, violations.size());
        assertTrue(violations.stream().anyMatch(v -> "sessionKey is required".equals(v.getMessage())));
        assertTrue(violations.stream().anyMatch(v -> "connectionId is required".equals(v.getMessage())));
    }

    @Test
    void cancelRequestRequiresSessionKey() {
        var violations = validator.validate(new CancelSqlExecutionRequest("", "query"));
        assertEquals(1, violations.size());
        assertEquals("sessionKey is required", violations.iterator().next().getMessage());
    }

    @Test
    void killSessionRequestRequiresKeys() {
        var violations = validator.validate(new KillSessionRequest(" ", "db", null, "query"));
        assertEquals(2, violations.size());
        assertTrue(violations.stream().anyMatch(v -> "connectionId is required".equals(v.getMessage())));
        assertTrue(violations.stream().anyMatch(v -> "sessionId is required".equals(v.getMessage())));
    }

    @Test
    void validKillSessionRequestPasses() {
        assertTrue(validator.validate(new KillSessionRequest("conn-1", null, "42", "query")).isEmpty());
    }

    @Test
    void validSessionRequestPasses() {
        assertTrue(validator.validate(new SqlSessionRequest("tab-1", "conn-1", null)).isEmpty());
    }
}
