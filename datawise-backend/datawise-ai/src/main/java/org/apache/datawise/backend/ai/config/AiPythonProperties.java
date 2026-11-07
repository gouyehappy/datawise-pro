package org.apache.datawise.backend.ai.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Python 深度分析执行配置
 */
@ConfigurationProperties(prefix = "datawise.ai.python")
public class AiPythonProperties {

    private boolean enabled = true;
    /**
     * simulated | process | docker | k8s
     */
    private String executor = "simulated";
    private boolean sandboxEnabled = true;
    private String pythonCommand = "python";
    private String pipCommand = "pip";
    private boolean dependencyInstallEnabled = false;
    private String allowedPackages = "pandas,numpy,scipy,scikit-learn,matplotlib,statsmodels,seaborn";
    private int dependencyInstallTimeoutSeconds = 60;
    private String dockerBinary = "docker";
    private String dockerImage = "python:3.12-slim";
    private String dockerMemory = "512m";
    private String k8sBinary = "kubectl";
    private String k8sNamespace = "default";
    private String k8sImage = "";
    private String k8sMemory = "512Mi";
    private int timeoutSeconds = 30;
    private int maxRetries = 2;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getExecutor() {
        return executor;
    }

    public void setExecutor(String executor) {
        this.executor = executor != null ? executor.trim() : "simulated";
    }

    public boolean isProcessExecutor() {
        return "process".equalsIgnoreCase(executor);
    }

    public boolean isDockerExecutor() {
        return "docker".equalsIgnoreCase(executor);
    }

    public boolean isK8sExecutor() {
        return "k8s".equalsIgnoreCase(executor);
    }

    public boolean isSandboxEnabled() {
        return sandboxEnabled;
    }

    public void setSandboxEnabled(boolean sandboxEnabled) {
        this.sandboxEnabled = sandboxEnabled;
    }

    public String getPythonCommand() {
        return pythonCommand != null && !pythonCommand.isBlank() ? pythonCommand.trim() : "python";
    }

    public void setPythonCommand(String pythonCommand) {
        this.pythonCommand = pythonCommand;
    }

    public String getPipCommand() {
        return pipCommand != null && !pipCommand.isBlank() ? pipCommand.trim() : "pip";
    }

    public void setPipCommand(String pipCommand) {
        this.pipCommand = pipCommand;
    }

    public boolean isDependencyInstallEnabled() {
        return dependencyInstallEnabled;
    }

    public void setDependencyInstallEnabled(boolean dependencyInstallEnabled) {
        this.dependencyInstallEnabled = dependencyInstallEnabled;
    }

    public String getAllowedPackages() {
        return allowedPackages;
    }

    public void setAllowedPackages(String allowedPackages) {
        this.allowedPackages = allowedPackages;
    }

    public Set<String> allowedPackageSet() {
        if (allowedPackages == null || allowedPackages.isBlank()) {
            return Set.of();
        }
        return Arrays.stream(allowedPackages.split(","))
                .map(String::trim)
                .filter(part -> !part.isBlank())
                .map(part -> part.toLowerCase(Locale.ROOT))
                .collect(Collectors.toUnmodifiableSet());
    }

    public int getDependencyInstallTimeoutSeconds() {
        return Math.max(10, dependencyInstallTimeoutSeconds);
    }

    public void setDependencyInstallTimeoutSeconds(int dependencyInstallTimeoutSeconds) {
        this.dependencyInstallTimeoutSeconds = dependencyInstallTimeoutSeconds;
    }

    public String getDockerBinary() {
        return dockerBinary != null && !dockerBinary.isBlank() ? dockerBinary.trim() : "docker";
    }

    public void setDockerBinary(String dockerBinary) {
        this.dockerBinary = dockerBinary;
    }

    public String getDockerImage() {
        return dockerImage != null && !dockerImage.isBlank() ? dockerImage.trim() : "python:3.12-slim";
    }

    public void setDockerImage(String dockerImage) {
        this.dockerImage = dockerImage;
    }

    public String getDockerMemory() {
        return dockerMemory != null && !dockerMemory.isBlank() ? dockerMemory.trim() : "512m";
    }

    public void setDockerMemory(String dockerMemory) {
        this.dockerMemory = dockerMemory;
    }

    public String getK8sBinary() {
        return k8sBinary != null && !k8sBinary.isBlank() ? k8sBinary.trim() : "kubectl";
    }

    public void setK8sBinary(String k8sBinary) {
        this.k8sBinary = k8sBinary;
    }

    public String getK8sNamespace() {
        return k8sNamespace != null && !k8sNamespace.isBlank() ? k8sNamespace.trim() : "default";
    }

    public void setK8sNamespace(String k8sNamespace) {
        this.k8sNamespace = k8sNamespace;
    }

    public String getK8sImage() {
        if (k8sImage != null && !k8sImage.isBlank()) {
            return k8sImage.trim();
        }
        return getDockerImage();
    }

    public void setK8sImage(String k8sImage) {
        this.k8sImage = k8sImage;
    }

    public String getK8sMemory() {
        return k8sMemory != null && !k8sMemory.isBlank() ? k8sMemory.trim() : "512Mi";
    }

    public void setK8sMemory(String k8sMemory) {
        this.k8sMemory = k8sMemory;
    }

    public int getTimeoutSeconds() {
        return Math.max(5, timeoutSeconds);
    }

    public void setTimeoutSeconds(int timeoutSeconds) {
        this.timeoutSeconds = timeoutSeconds;
    }

    public int getMaxRetries() {
        return Math.max(1, maxRetries);
    }

    public void setMaxRetries(int maxRetries) {
        this.maxRetries = maxRetries;
    }
}
