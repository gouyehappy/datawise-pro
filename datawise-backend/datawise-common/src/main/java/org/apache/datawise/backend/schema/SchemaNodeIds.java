package org.apache.datawise.backend.schema;

import org.apache.datawise.backend.common.support.PathSegmentSanitizer;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Locale;

public final class SchemaNodeIds {

    private SchemaNodeIds() {
    }

    public static String nodeId(String prefix, String connectionId, String... parts) {
        StringBuilder sb = new StringBuilder(prefix).append('-').append(connectionId);
        for (String part : parts) {
            sb.append('-').append(slug(part));
        }
        return sb.toString();
    }

    /**
     * workspaces SQL 文件节点 id：连接 + 实例 + 规范化文件名（Base64），同实例下文件名唯一
     */
    public static String workspaceSqlFileNodeId(
                                                String connectionId,
                                                String instanceName,
                                                String fileName) {
        String conn = slug(connectionId);
        String inst = slug(instanceName);
        String fileKey = encodeSqlFileNameKey(fileName);
        return "ws-file-" + conn + "-" + inst + "-" + fileKey;
    }

    public static String encodeSqlFileNameKey(String fileName) {
        String normalized = PathSegmentSanitizer.sanitizeFileName(fileName, "console.sql")
                .toLowerCase(Locale.ROOT);
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(normalized.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * 视图模型节点 id：连接 + 实例 + 规范化文件名（Base64）
     */
    public static String viewModelNodeId(
                                         String connectionId,
                                         String instanceName,
                                         String fileName) {
        String conn = slug(connectionId);
        String inst = slug(instanceName);
        String fileKey = encodeViewModelFileNameKey(fileName);
        return "vm-file-" + conn + "-" + inst + "-" + fileKey;
    }

    /** 语义层指标节点 id：连接 + 实例 + 指标 id */
    public static String semanticMetricNodeId(String connectionId, String instanceName, String metricId) {
        String conn = slug(connectionId);
        String inst = slug(instanceName);
        String metricKey = slug(metricId);
        return "sem-metric-" + conn + "-" + inst + "-" + metricKey;
    }

    /** 平台能力入口节点 id */
    public static String platformFeatureNodeId(String connectionId, String instanceName, String featureKey) {
        return "pf-" + slug(connectionId) + "-" + slug(instanceName) + "-" + slug(featureKey);
    }

    public static String encodeViewModelFileNameKey(String fileName) {
        String normalized = PathSegmentSanitizer.sanitizeViewModelFileName(fileName, "query.view.sql")
                .toLowerCase(Locale.ROOT);
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(normalized.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * 树节点 id 片段：纯 ASCII 保留可读 slug；含中文等字符时用稳定 token
     */
    public static String slug(String value) {
        if (value == null || value.isBlank()) {
            return "unknown";
        }
        boolean hasNonAscii = value.chars().anyMatch(ch -> ch >= 128);
        String ascii = value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "_");
        ascii = ascii.replaceAll("^_+|_+$", "");
        if (!hasNonAscii && !ascii.isEmpty() && ascii.length() >= 2) {
            return ascii.length() > 48 ? ascii.substring(0, 48) : ascii;
        }
        return "u" + Integer.toUnsignedString(value.hashCode(), 36);
    }
}
