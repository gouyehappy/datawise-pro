package org.apache.datawise.backend.ai.analysis.python;

import org.apache.datawise.backend.ai.config.AiPythonProperties;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PythonDependencySupportTest {

    @Test
    void mapsSklearnToScikitLearn() {
        AiPythonProperties properties = new AiPythonProperties();
        properties.setDependencyInstallEnabled(true);
        properties.setAllowedPackages("scikit-learn,pandas");

        List<String> packages = PythonDependencySupport.resolveAllowedPackages(
                """
                from sklearn.linear_model import LinearRegression
                import pandas as pd
                """,
                properties
        );

        assertEquals(2, packages.size());
        assertTrue(packages.contains("scikit-learn"));
        assertTrue(packages.contains("pandas"));
    }

    @Test
    void ignoresStdlibAndDisallowedPackages() {
        AiPythonProperties properties = new AiPythonProperties();
        properties.setDependencyInstallEnabled(true);
        properties.setAllowedPackages("pandas");

        List<String> packages = PythonDependencySupport.resolveAllowedPackages(
                """
                import json
                import requests
                import pandas
                """,
                properties
        );

        assertEquals(List.of("pandas"), packages);
    }

    @Test
    void buildContainerShellInstallsBeforePython() {
        String shell = PythonDependencySupport.buildContainerShell(
                true,
                List.of("python", "-I", "-B", "/workspace/analysis.py"),
                "/workspace",
                "/tmp/deps"
        );
        assertTrue(shell.contains("pip install"));
        assertTrue(shell.contains("PYTHONPATH=/tmp/deps"));
        assertTrue(shell.contains("python -I -B /workspace/analysis.py"));
    }

    @Test
    void skipsDependencyResolutionWhenDisabled() {
        AiPythonProperties properties = new AiPythonProperties();
        properties.setDependencyInstallEnabled(false);

        assertTrue(PythonDependencySupport.resolveAllowedPackages("import pandas", properties).isEmpty());
    }

    @Test
    void requirementsContentIsNewlineTerminated() {
        assertEquals("pandas\nnumpy\n", PythonDependencySupport.requirementsContent(List.of("pandas", "numpy")));
        assertEquals("", PythonDependencySupport.requirementsContent(List.of()));
    }
}
