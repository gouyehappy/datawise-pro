package org.apache.datawise.backend.ai.analysis.python;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.List;

/**
 * 构建 Kubernetes Job / NetworkPolicy 清单与 kubectl 参数。
 * 对齐 Docker 隔离意图：cpu/memory、只读根盘、drop ALL、禁止提权、/tmp emptyDir、
 * 禁 SA token / hostNetwork|PID|IPC、deny-all NetworkPolicy（等同 {@code --network none}）。
 * 进程数上限仍依赖集群 kubelet {@code --pod-max-pids} / RuntimeClass，Job API 无便携字段。
 */
public final class PythonK8sSupport {

    static final String DEFAULT_CPU = "1";
    static final String DEFAULT_TMP_SIZE = "64Mi";
    /** Pod label selecting the deny-all NetworkPolicy for this run. */
    static final String RUN_LABEL = "datawise.ai/python-run";

    private PythonK8sSupport() {
    }

    public static String sanitizeResourceName(String prefix) {
        String normalized = prefix.toLowerCase()
                .replaceAll("[^a-z0-9-]", "-")
                .replaceAll("-{2,}", "-")
                .replaceAll("^-|-$", "");
        if (normalized.isBlank()) {
            normalized = "datawise-py";
        }
        if (normalized.length() > 52) {
            normalized = normalized.substring(0, 52);
        }
        return normalized;
    }

    public static String networkPolicyName(String jobName) {
        return jobName + "-net";
    }

    public static String buildJobManifestJson(
            ObjectMapper objectMapper,
            String jobName,
            String namespace,
            String image,
            String memoryLimit,
            String configMapName,
            String shellCommand
    ) {
        return buildJobManifestJson(
                objectMapper,
                jobName,
                namespace,
                image,
                memoryLimit,
                DEFAULT_CPU,
                configMapName,
                shellCommand
        );
    }

    public static String buildJobManifestJson(
            ObjectMapper objectMapper,
            String jobName,
            String namespace,
            String image,
            String memoryLimit,
            String cpuLimit,
            String configMapName,
            String shellCommand
    ) {
        String cpu = cpuLimit != null && !cpuLimit.isBlank() ? cpuLimit.trim() : DEFAULT_CPU;
        ObjectNode root = objectMapper.createObjectNode();
        root.put("apiVersion", "batch/v1");
        root.put("kind", "Job");
        ObjectNode metadata = root.putObject("metadata");
        metadata.put("name", jobName);
        metadata.put("namespace", namespace);
        ObjectNode spec = root.putObject("spec");
        spec.put("ttlSecondsAfterFinished", 120);
        spec.put("backoffLimit", 0);
        ObjectNode template = spec.putObject("template");
        ObjectNode podMeta = template.putObject("metadata");
        ObjectNode podLabels = podMeta.putObject("labels");
        podLabels.put(RUN_LABEL, jobName);
        podLabels.put("app.kubernetes.io/name", "datawise-python");
        podLabels.put("app.kubernetes.io/component", "ai-executor");
        ObjectNode podSpec = template.putObject("spec");
        podSpec.put("restartPolicy", "Never");
        podSpec.put("automountServiceAccountToken", false);
        podSpec.put("enableServiceLinks", false);
        podSpec.put("hostNetwork", false);
        podSpec.put("hostPID", false);
        podSpec.put("hostIPC", false);

        ObjectNode container = podSpec.putArray("containers").addObject();
        container.put("name", "python");
        container.put("image", image);
        container.putArray("command").add("sh").add("-c").add(shellCommand);
        ObjectNode resources = container.putObject("resources");
        ObjectNode limits = resources.putObject("limits");
        limits.put("memory", memoryLimit);
        limits.put("cpu", cpu);

        ObjectNode containerSecurity = container.putObject("securityContext");
        containerSecurity.put("allowPrivilegeEscalation", false);
        containerSecurity.put("readOnlyRootFilesystem", true);
        containerSecurity.put("privileged", false);
        containerSecurity.putObject("capabilities").putArray("drop").add("ALL");
        containerSecurity.putObject("seccompProfile").put("type", "RuntimeDefault");

        var volumeMounts = container.putArray("volumeMounts");
        ObjectNode workspaceMount = volumeMounts.addObject();
        workspaceMount.put("name", "workspace");
        workspaceMount.put("mountPath", "/workspace");
        workspaceMount.put("readOnly", true);
        ObjectNode tmpMount = volumeMounts.addObject();
        tmpMount.put("name", "tmp");
        tmpMount.put("mountPath", "/tmp");

        var volumes = podSpec.putArray("volumes");
        ObjectNode workspaceVolume = volumes.addObject();
        workspaceVolume.put("name", "workspace");
        workspaceVolume.putObject("configMap").put("name", configMapName);
        ObjectNode tmpVolume = volumes.addObject();
        tmpVolume.put("name", "tmp");
        tmpVolume.putObject("emptyDir").put("sizeLimit", DEFAULT_TMP_SIZE);
        return root.toPrettyString();
    }

    /**
     * Deny-all NetworkPolicy for the Job pod (Ingress + Egress empty = isolate like Docker {@code --network none}).
     * Requires a CNI that enforces NetworkPolicy; apply failure should fail-closed.
     */
    public static String buildNetworkPolicyManifestJson(
            ObjectMapper objectMapper,
            String jobName,
            String namespace
    ) {
        ObjectNode root = objectMapper.createObjectNode();
        root.put("apiVersion", "networking.k8s.io/v1");
        root.put("kind", "NetworkPolicy");
        ObjectNode metadata = root.putObject("metadata");
        metadata.put("name", networkPolicyName(jobName));
        metadata.put("namespace", namespace);
        ObjectNode labels = metadata.putObject("labels");
        labels.put(RUN_LABEL, jobName);
        labels.put("app.kubernetes.io/name", "datawise-python");
        ObjectNode spec = root.putObject("spec");
        spec.putObject("podSelector").putObject("matchLabels").put(RUN_LABEL, jobName);
        spec.putArray("policyTypes").add("Ingress").add("Egress");
        // Empty ingress/egress arrays intentionally omitted — with both policyTypes set,
        // absence of rules denies all traffic for selected pods.
        return root.toPrettyString();
    }

    public static List<String> buildCreateConfigMapCommand(
            String kubectlBinary,
            String configMapName,
            String namespace,
            String hostWorkDir
    ) {
        return List.of(
                kubectlBinary,
                "create",
                "configmap",
                configMapName,
                "--from-file=" + hostWorkDir,
                "-n",
                namespace,
                "--dry-run=client",
                "-o",
                "yaml"
        );
    }

    public static List<String> buildApplyCommand(String kubectlBinary, String manifestPath) {
        return List.of(kubectlBinary, "apply", "-f", manifestPath);
    }

    public static List<String> buildWaitJobCommand(
            String kubectlBinary,
            String jobName,
            String namespace,
            int timeoutSeconds
    ) {
        return List.of(
                kubectlBinary,
                "wait",
                "--for=condition=complete",
                "job/" + jobName,
                "-n",
                namespace,
                "--timeout=" + Math.max(5, timeoutSeconds) + "s"
        );
    }

    public static List<String> buildJobLogsCommand(String kubectlBinary, String jobName, String namespace) {
        return List.of(kubectlBinary, "logs", "job/" + jobName, "-n", namespace);
    }

    public static List<String> buildDeleteCommand(
            String kubectlBinary,
            String namespace,
            String... resourceNames
    ) {
        List<String> command = new java.util.ArrayList<>();
        command.add(kubectlBinary);
        command.add("delete");
        command.add("-n");
        command.add(namespace);
        command.add("--ignore-not-found=true");
        for (String resource : resourceNames) {
            command.add(resource);
        }
        return command;
    }
}
