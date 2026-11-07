package org.apache.datawise.backend.ai.analysis.python;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PythonSandboxSupportTest {

    @Test
    void blocksDangerousImports() {
        assertTrue(PythonSandboxSupport.validateUserCode("import os").isPresent());
    }

    @Test
    void allowsSafeAnalysisCode() {
        assertFalse(PythonSandboxSupport.validateUserCode("print(len(rows))").isPresent());
    }
}
