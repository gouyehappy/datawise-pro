package org.apache.datawise.backend.ai.domain;

public record AiPythonRuntimeDto(
        boolean enabled,
        String executor,
        boolean sandboxEnabled,
        boolean dependencyInstallEnabled,
        String dockerImage,
        String k8sNamespace,
        int timeoutSeconds,
        int dependencyInstallTimeoutSeconds,
        int maxRetries
) {
}
