package org.apache.datawise.backend.ai.analysis.python;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.ai.config.AiPythonProperties;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.ai.domain.PythonExecutionResult;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** 在 Kubernetes Job 中执行 Python（ConfigMap 挂载 + 可选 pip 安装）。 */
@Component
public class K8sPythonCodeExecutor implements PythonCodeExecutor {

    private static final Logger log = LoggerFactory.getLogger(K8sPythonCodeExecutor.class);

    private final AiPythonProperties pythonProperties;
    private final ObjectMapper objectMapper;

    public K8sPythonCodeExecutor(AiPythonProperties pythonProperties, ObjectMapper objectMapper) {
        this.pythonProperties = pythonProperties;
        this.objectMapper = objectMapper;
    }

    @Override
    public boolean isAvailable() {
        return pythonProperties.isEnabled() && pythonProperties.isK8sExecutor();
    }

    @Override
    public PythonExecutionResult execute(String code, ExecuteSqlResult sqlResult, String prompt) {
        Optional<String> violation = PythonExecutionSupport.validateCode(code, pythonProperties);
        if (violation.isPresent()) {
            return PythonExecutionResult.failure(violation.get(), "");
        }

        PythonExecutionSupport.PreparedRun prepared = null;
        Path jobManifest = null;
        Path configMapManifest = null;
        String jobName = PythonK8sSupport.sanitizeResourceName("datawise-py-" + UUID.randomUUID());
        String configMapName = jobName + "-cm";
        String namespace = pythonProperties.getK8sNamespace();
        String kubectl = pythonProperties.getK8sBinary();
        try {
            prepared = PythonExecutionSupport.prepareRun(objectMapper, pythonProperties, code, sqlResult);
            String shell = PythonDependencySupport.buildContainerShell(
                    !prepared.packages().isEmpty(),
                    prepared.pythonCommand(),
                    "/workspace",
                    "/tmp/deps"
            );
            jobManifest = Files.createTempFile("datawise-k8s-job-", ".json");
            configMapManifest = Files.createTempFile("datawise-k8s-cm-", ".yaml");
            Files.writeString(
                    jobManifest,
                    PythonK8sSupport.buildJobManifestJson(
                            objectMapper,
                            jobName,
                            namespace,
                            pythonProperties.getK8sImage(),
                            pythonProperties.getK8sMemory(),
                            configMapName,
                            shell
                    ),
                    StandardCharsets.UTF_8
            );

            PythonExecutionResult configMapYaml = PythonProcessRunner.run(
                    PythonK8sSupport.buildCreateConfigMapCommand(
                            kubectl,
                            configMapName,
                            namespace,
                            prepared.workspace().directory().toAbsolutePath().toString()
                    ),
                    pythonProperties.getTimeoutSeconds()
            );
            if (!configMapYaml.ok()) {
                return PythonExecutionResult.failure(
                        "Failed to render ConfigMap: " + configMapYaml.errorMessage(),
                        configMapYaml.stdout()
                );
            }
            Files.writeString(configMapManifest, configMapYaml.stdout() + "\n", StandardCharsets.UTF_8);

            PythonExecutionResult applyConfigMap = PythonProcessRunner.run(
                    PythonK8sSupport.buildApplyCommand(kubectl, configMapManifest.toAbsolutePath().toString()),
                    pythonProperties.getTimeoutSeconds()
            );
            if (!applyConfigMap.ok()) {
                return PythonExecutionResult.failure(
                        "Failed to apply ConfigMap: " + applyConfigMap.errorMessage(),
                        applyConfigMap.stdout()
                );
            }

            PythonExecutionResult applyJob = PythonProcessRunner.run(
                    PythonK8sSupport.buildApplyCommand(kubectl, jobManifest.toAbsolutePath().toString()),
                    pythonProperties.getTimeoutSeconds()
            );
            if (!applyJob.ok()) {
                return PythonExecutionResult.failure(
                        "Failed to apply Job: " + applyJob.errorMessage(),
                        applyJob.stdout()
                );
            }

            int totalTimeout = pythonProperties.getTimeoutSeconds()
                    + (prepared.packages().isEmpty() ? 0 : pythonProperties.getDependencyInstallTimeoutSeconds());
            PythonExecutionResult waitJob = PythonProcessRunner.run(
                    PythonK8sSupport.buildWaitJobCommand(kubectl, jobName, namespace, totalTimeout),
                    totalTimeout + 5
            );
            if (!waitJob.ok()) {
                PythonExecutionResult logs = PythonProcessRunner.run(
                        PythonK8sSupport.buildJobLogsCommand(kubectl, jobName, namespace),
                        pythonProperties.getTimeoutSeconds()
                );
                return PythonExecutionResult.failure(
                        "Kubernetes Job failed: " + waitJob.errorMessage(),
                        logs.stdout()
                );
            }

            PythonExecutionResult logs = PythonProcessRunner.run(
                    PythonK8sSupport.buildJobLogsCommand(kubectl, jobName, namespace),
                    pythonProperties.getTimeoutSeconds()
            );
            if (!logs.ok()) {
                return PythonExecutionResult.failure(
                        "Failed to read Job logs: " + logs.errorMessage(),
                        logs.stdout()
                );
            }
            return PythonExecutionResult.success(logs.stdout().trim());
        } catch (IOException ex) {
            log.warn("Kubernetes Python execution failed: {}", ex.getMessage());
            return PythonExecutionResult.failure(ex.getMessage(), "");
        } finally {
            cleanupK8sResources(kubectl, namespace, jobName, configMapName);
            deleteIfExists(jobManifest);
            deleteIfExists(configMapManifest);
            if (prepared != null) {
                prepared.workspace().cleanup();
            }
        }
    }

    private void cleanupK8sResources(String kubectl, String namespace, String jobName, String configMapName) {
        PythonProcessRunner.run(
                PythonK8sSupport.buildDeleteCommand(
                        kubectl,
                        namespace,
                        "job/" + jobName,
                        "configmap/" + configMapName
                ),
                pythonProperties.getTimeoutSeconds()
        );
    }

    private static void deleteIfExists(Path path) {
        if (path == null) {
            return;
        }
        try {
            Files.deleteIfExists(path);
        } catch (IOException ex) {
            ExceptionLogging.recoverable(log, "Failed to delete temp file " + path, ex);
        }
    }
}
