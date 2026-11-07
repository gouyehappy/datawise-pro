package org.apache.datawise.backend.ai.analysis.python;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.ai.config.AiPythonProperties;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.ai.domain.PythonExecutionResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

@Component
public class ProcessPythonCodeExecutor implements PythonCodeExecutor {

    private static final Logger log = LoggerFactory.getLogger(ProcessPythonCodeExecutor.class);

    private final AiPythonProperties pythonProperties;
    private final ObjectMapper objectMapper;

    public ProcessPythonCodeExecutor(AiPythonProperties pythonProperties, ObjectMapper objectMapper) {
        this.pythonProperties = pythonProperties;
        this.objectMapper = objectMapper;
    }

    @Override
    public boolean isAvailable() {
        return pythonProperties.isEnabled() && pythonProperties.isProcessExecutor();
    }

    @Override
    public PythonExecutionResult execute(String code, ExecuteSqlResult sqlResult, String prompt) {
        Optional<String> violation = PythonExecutionSupport.validateCode(code, pythonProperties);
        if (violation.isPresent()) {
            return PythonExecutionResult.failure(violation.get(), "");
        }

        PythonExecutionSupport.PreparedRun prepared = null;
        try {
            prepared = PythonExecutionSupport.prepareRun(objectMapper, pythonProperties, code, sqlResult);
            PythonExecutionResult install = PythonExecutionSupport.installDependenciesOnHost(prepared, pythonProperties);
            if (!install.ok()) {
                return PythonExecutionResult.failure(
                        "Failed to install Python dependencies: " + install.errorMessage(),
                        install.stderr()
                );
            }
            PythonExecutionResult result = PythonProcessRunner.run(
                    prepared.pythonCommand(),
                    PythonExecutionSupport.hostRunEnvironment(prepared, pythonProperties),
                    prepared.workspace().directory(),
                    pythonProperties.getTimeoutSeconds()
            );
            if (!result.ok()) {
                return PythonExecutionResult.failure(result.errorMessage(), result.stderr());
            }
            return PythonExecutionResult.success(result.stdout());
        } catch (Exception ex) {
            log.warn("Python process execution failed: {}", ex.getMessage());
            return PythonExecutionResult.failure(ex.getMessage(), "");
        } finally {
            if (prepared != null) {
                prepared.workspace().cleanup();
            }
        }
    }
}
