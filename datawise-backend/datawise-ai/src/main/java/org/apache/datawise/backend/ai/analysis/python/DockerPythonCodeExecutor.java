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

/** Docker 容器内执行 Python（--network none + 只读挂载 + 可选 pip 依赖）。 */
@Component
public class DockerPythonCodeExecutor implements PythonCodeExecutor {

    private static final Logger log = LoggerFactory.getLogger(DockerPythonCodeExecutor.class);

    private final AiPythonProperties pythonProperties;
    private final ObjectMapper objectMapper;

    public DockerPythonCodeExecutor(AiPythonProperties pythonProperties, ObjectMapper objectMapper) {
        this.pythonProperties = pythonProperties;
        this.objectMapper = objectMapper;
    }

    @Override
    public boolean isAvailable() {
        return pythonProperties.isEnabled() && pythonProperties.isDockerExecutor();
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
            List<String> containerCommand = buildContainerCommand(prepared);
            List<String> command = PythonDockerSupport.buildDockerRunCommand(
                    pythonProperties.getDockerBinary(),
                    pythonProperties.getDockerImage(),
                    pythonProperties.getDockerMemory(),
                    prepared.workspace().directory().toAbsolutePath().toString(),
                    containerCommand
            );
            PythonExecutionResult result = PythonProcessRunner.run(command, pythonProperties.getTimeoutSeconds());
            if (!result.ok()) {
                return PythonExecutionResult.failure(result.errorMessage(), result.stderr());
            }
            return PythonExecutionResult.success(result.stdout());
        } catch (Exception ex) {
            log.warn("Docker Python execution failed: {}", ex.getMessage());
            return PythonExecutionResult.failure(ex.getMessage(), "");
        } finally {
            if (prepared != null) {
                prepared.workspace().cleanup();
            }
        }
    }

    private List<String> buildContainerCommand(PythonExecutionSupport.PreparedRun prepared) {
        if (prepared.packages().isEmpty()) {
            return prepared.pythonCommand();
        }
        String shell = PythonDependencySupport.buildContainerShell(
                true,
                prepared.pythonCommand(),
                "/workspace",
                "/tmp/deps"
        );
        return List.of("sh", "-c", shell);
    }
}
