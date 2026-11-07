package org.apache.datawise.backend.ai.analysis.python;

import org.apache.datawise.backend.ai.domain.PythonExecutionResult;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@EnabledOnOs({OS.WINDOWS, OS.LINUX, OS.MAC})
class PythonProcessRunnerTest {

    @Test
    void run_collectsStdoutFromSuccessfulProcess() {
        List<String> command = isWindows()
                ? List.of("cmd", "/c", "echo hello-python")
                : List.of("sh", "-c", "printf hello-python");

        PythonExecutionResult result = PythonProcessRunner.run(command, 10);

        assertTrue(result.ok());
        assertTrue(result.stdout().contains("hello-python"));
    }

    @Test
    void run_returnsFailureForNonZeroExitCode() {
        List<String> command = isWindows()
                ? List.of("cmd", "/c", "exit 3")
                : List.of("sh", "-c", "exit 3");

        PythonExecutionResult result = PythonProcessRunner.run(command, 10);

        assertFalse(result.ok());
        assertTrue(result.errorMessage().contains("code 3"));
    }

    private static boolean isWindows() {
        return System.getProperty("os.name", "").toLowerCase().contains("win");
    }
}
