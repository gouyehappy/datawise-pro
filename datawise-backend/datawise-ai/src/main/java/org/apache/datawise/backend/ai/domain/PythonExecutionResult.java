package org.apache.datawise.backend.ai.domain;

/**
 * Python 沙箱执行结果
 */
public record PythonExecutionResult(
        boolean ok,
        String stdout,
        String stderr,
        String errorMessage
) {
    public static PythonExecutionResult success(String stdout) {
        return new PythonExecutionResult(true, stdout != null ? stdout : "", "", "");
    }

    public static PythonExecutionResult failure(String errorMessage, String stderr) {
        return new PythonExecutionResult(false, "", stderr != null ? stderr : "", errorMessage);
    }
}
