package org.apache.datawise.backend.domain;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SaveDataQualityTemplateRequestValidationTest {

    private static Validator validator;

    @BeforeAll
    static void setUpValidator() {
        validator = Validation.buildDefaultValidatorFactory().getValidator();
    }

    @Test
    void requiresNameAndSql() {
        var violations = validator.validate(new SaveDataQualityTemplateRequest(
                null,
                " ",
                null,
                null,
                "empty_result",
                "0",
                null,
                true,
                null));
        assertEquals(2, violations.size());
        assertTrue(violations.stream().allMatch(v -> "name and sql are required".equals(v.getMessage())));
    }

    @Test
    void validTemplatePasses() {
        assertTrue(validator.validate(new SaveDataQualityTemplateRequest(
                null,
                "row count",
                "desc",
                "select 1",
                "empty_result",
                "0",
                null,
                false,
                null)).isEmpty());
    }
}
