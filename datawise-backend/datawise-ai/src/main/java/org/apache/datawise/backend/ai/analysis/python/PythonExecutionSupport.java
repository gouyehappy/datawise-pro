package org.apache.datawise.backend.ai.analysis.python;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.ai.config.AiPythonProperties;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.ai.domain.PythonExecutionResult;

import java.io.IOException;
import java.nio.file.Files;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** 准备 Python 工作区、解析依赖并在本机安装。 */
public final class PythonExecutionSupport {

    public record PreparedRun(
            PythonExecutionWorkspace workspace,
            List<String> packages,
            List<String> pythonCommand
    ) {
    }

    private PythonExecutionSupport() {
    }

    public static Optional<String> validateCode(String code, AiPythonProperties properties) {
        if (properties.isSandboxEnabled()) {
            return PythonSandboxSupport.validateUserCode(code);
        }
        if (code == null || code.isBlank()) {
            return Optional.of("Python code is empty");
        }
        return Optional.empty();
    }

    public static PreparedRun prepareRun(
            ObjectMapper objectMapper,
            AiPythonProperties properties,
            String code,
            ExecuteSqlResult sqlResult
    ) throws IOException {
        PythonExecutionWorkspace workspace = PythonExecutionWorkspace.prepare(
                objectMapper,
                code,
                sqlResult,
                properties.isSandboxEnabled()
        );
        List<String> packages = PythonDependencySupport.resolveAllowedPackages(code, properties);
        workspace.writeRequirements(packages);
        List<String> pythonCommand = PythonSandboxSupport.buildPythonCommand(
                properties.isDockerExecutor() || properties.isK8sExecutor()
                        ? "python"
                        : properties.getPythonCommand(),
                properties.isDockerExecutor() || properties.isK8sExecutor()
                        ? "/workspace/analysis.py"
                        : workspace.scriptPath().toAbsolutePath().toString(),
                properties.isSandboxEnabled()
        );
        return new PreparedRun(workspace, packages, pythonCommand);
    }

    public static PythonExecutionResult installDependenciesOnHost(
            PreparedRun prepared,
            AiPythonProperties properties
    ) {
        if (prepared.packages().isEmpty()) {
            return PythonExecutionResult.success("");
        }
        try {
            Files.createDirectories(prepared.workspace().depsDirectory());
        } catch (IOException ex) {
            return PythonExecutionResult.failure("Failed to create deps directory: " + ex.getMessage(), "");
        }
        List<String> pipCommand = PythonDependencySupport.buildPipInstallCommand(
                properties.getPipCommand(),
                prepared.workspace().requirementsPath().toAbsolutePath().toString(),
                prepared.workspace().depsDirectory().toAbsolutePath().toString()
        );
        Map<String, String> env = properties.isSandboxEnabled()
                ? new LinkedHashMap<>(PythonSandboxSupport.sandboxEnvironment())
                : Map.of();
        return PythonProcessRunner.run(
                pipCommand,
                env,
                prepared.workspace().directory(),
                properties.getDependencyInstallTimeoutSeconds()
        );
    }

    public static Map<String, String> hostRunEnvironment(
            PreparedRun prepared,
            AiPythonProperties properties
    ) {
        Map<String, String> env = properties.isSandboxEnabled()
                ? new LinkedHashMap<>(PythonSandboxSupport.sandboxEnvironment())
                : new LinkedHashMap<>(System.getenv());
        if (!prepared.packages().isEmpty()) {
            env.put(
                    "PYTHONPATH",
                    prepared.workspace().depsDirectory().toAbsolutePath().toString()
            );
        }
        return env;
    }
}
