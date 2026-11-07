package org.apache.datawise.backend.ai.analysis.python;

import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.ai.domain.PythonExecutionResult;

/**
 * Python 代码执行器（simulated / process / docker / k8s）
 */
public interface PythonCodeExecutor {

    boolean isAvailable();

    PythonExecutionResult execute(String code, ExecuteSqlResult sqlResult, String prompt);
}
