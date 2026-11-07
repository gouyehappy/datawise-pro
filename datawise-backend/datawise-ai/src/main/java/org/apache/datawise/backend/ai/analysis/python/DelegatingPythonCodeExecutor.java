package org.apache.datawise.backend.ai.analysis.python;

import org.apache.datawise.backend.ai.config.AiPythonProperties;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.ai.domain.PythonExecutionResult;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

@Primary
@Component
public class DelegatingPythonCodeExecutor implements PythonCodeExecutor {

    private final SimulatedPythonCodeExecutor simulatedExecutor;
    private final ProcessPythonCodeExecutor processExecutor;
    private final DockerPythonCodeExecutor dockerExecutor;
    private final K8sPythonCodeExecutor k8sExecutor;
    private final AiPythonProperties pythonProperties;

    public DelegatingPythonCodeExecutor(
            SimulatedPythonCodeExecutor simulatedExecutor,
            ProcessPythonCodeExecutor processExecutor,
            DockerPythonCodeExecutor dockerExecutor,
            K8sPythonCodeExecutor k8sExecutor,
            AiPythonProperties pythonProperties
    ) {
        this.simulatedExecutor = simulatedExecutor;
        this.processExecutor = processExecutor;
        this.dockerExecutor = dockerExecutor;
        this.k8sExecutor = k8sExecutor;
        this.pythonProperties = pythonProperties;
    }

    @Override
    public boolean isAvailable() {
        return pythonProperties.isEnabled() && delegate().isAvailable();
    }

    @Override
    public PythonExecutionResult execute(String code, ExecuteSqlResult sqlResult, String prompt) {
        return delegate().execute(code, sqlResult, prompt);
    }

    private PythonCodeExecutor delegate() {
        if (pythonProperties.isK8sExecutor()) {
            return k8sExecutor;
        }
        if (pythonProperties.isDockerExecutor()) {
            return dockerExecutor;
        }
        if (pythonProperties.isProcessExecutor()) {
            return processExecutor;
        }
        return simulatedExecutor;
    }
}
