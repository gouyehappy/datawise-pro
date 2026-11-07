package org.apache.datawise.backend.connector.kubernetes.support;

import org.apache.datawise.backend.connector.support.ConnectorErrorSupport;
import org.apache.datawise.backend.connector.support.ConnectorErrorTemplate;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class KubernetesConnectionErrors {

    private static final Pattern FORBIDDEN_MESSAGE = Pattern.compile(
            "\"message\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\"",
            Pattern.CASE_INSENSITIVE
    );

    private static final ConnectorErrorTemplate TEMPLATE = new ConnectorErrorTemplate(
            "Kubernetes",
            "Check API server host, port, token/kubeconfig, and network.",
            "Check API server host, port, firewall/VPN, and that the control plane is reachable.",
            "Check the API server hostname (not Dashboard URL). For self-signed certs keep insecureSkipTlsVerify=true.",
            "Check bearer token or kubeconfig credentials and RBAC permissions.",
            "Check connection settings and Kubernetes API server availability.",
            lower -> lower.contains("401") || lower.contains("403") || lower.contains("unauthorized")
                    || lower.contains("forbidden") || lower.contains("authentication"),
            false
    );

    private KubernetesConnectionErrors() {
    }

    public static String toUserMessage(ConnectionEntity entity, Exception ex) {
        String root = ex == null || ex.getMessage() == null ? "" : ex.getMessage();
        String lower = root.toLowerCase(Locale.ROOT);
        if (lower.contains("403") || lower.contains("forbidden")) {
            String detail = extractStatusMessage(root);
            if (detail != null && !detail.isBlank()) {
                if (detail.toLowerCase(Locale.ROOT).contains("at the cluster scope")) {
                    return "Kubernetes RBAC 拒绝：当前凭证无权进行集群范围列表。"
                            + "请选择具体 Namespace 后再查询（「全部 Namespace」需要 ClusterRole）。"
                            + " Details: " + detail;
                }
                return "Kubernetes RBAC 拒绝：当前凭证无权访问该资源。"
                        + "请更换有权限的 Namespace/账号，或联系集群管理员授权。"
                        + " Details: " + detail;
            }
            return "Kubernetes RBAC 拒绝（403 Forbidden）。请选择有权限的 Namespace，"
                    + "或检查 ServiceAccount / ClusterRole 是否包含所需 list/get 权限。";
        }
        return ConnectorErrorSupport.toUserMessage(entity, ex, TEMPLATE);
    }

    /** True when the failure is a client/authz problem that should surface as 400, not 500. */
    public static boolean isClientFacingError(Throwable error) {
        String root = error == null || error.getMessage() == null ? "" : error.getMessage();
        String lower = root.toLowerCase(Locale.ROOT);
        return lower.contains("401")
                || lower.contains("403")
                || lower.contains("404")
                || lower.contains("forbidden")
                || lower.contains("unauthorized")
                || lower.contains("namespace is required");
    }

    private static String extractStatusMessage(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        Matcher matcher = FORBIDDEN_MESSAGE.matcher(raw);
        if (!matcher.find()) {
            return null;
        }
        return matcher.group(1)
                .replace("\\\"", "\"")
                .replace("\\\\", "\\");
    }
}
