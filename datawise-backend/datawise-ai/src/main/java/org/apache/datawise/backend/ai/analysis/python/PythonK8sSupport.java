package org.apache.datawise.backend.ai.analysis.python;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.List;

/** 构建 Kubernetes Job 清单与 kubectl 参数。 */
public final class PythonK8sSupport {

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

    public static String buildJobManifestJson(
            ObjectMapper objectMapper,
            String jobName,
            String namespace,
            String image,
            String memoryLimit,
            String configMapName,
            String shellCommand
    ) {
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
        ObjectNode podSpec = template.putObject("spec");
        podSpec.put("restartPolicy", "Never");
        podSpec.put("automountServiceAccountToken", false);
        ObjectNode container = podSpec.putArray("containers").addObject();
        container.put("name", "python");
        container.put("image", image);
        container.putArray("command").add("sh").add("-c").add(shellCommand);
        ObjectNode resources = container.putObject("resources");
        resources.putObject("limits").put("memory", memoryLimit);
        ObjectNode mount = container.putArray("volumeMounts").addObject();
        mount.put("name", "workspace");
        mount.put("mountPath", "/workspace");
        mount.put("readOnly", true);
        ObjectNode volume = podSpec.putArray("volumes").addObject();
        volume.put("name", "workspace");
        volume.putObject("configMap").put("name", configMapName);
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
