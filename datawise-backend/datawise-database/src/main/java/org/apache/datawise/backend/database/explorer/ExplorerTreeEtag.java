package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.domain.TreeNode;

import java.util.List;

/** Stable weak ETag for explorer child payloads. */
public final class ExplorerTreeEtag {

    private ExplorerTreeEtag() {
    }

    public static String of(String connectionId, String nodeId, List<TreeNode> nodes, long cacheVersion) {
        int count = nodes != null ? nodes.size() : 0;
        String firstId = "";
        String lastId = "";
        if (count > 0) {
            TreeNode first = nodes.get(0);
            if (first != null) {
                firstId = nullToEmpty(first.getId());
            }
            TreeNode last = nodes.get(count - 1);
            if (last != null) {
                lastId = nullToEmpty(last.getId());
            }
        }
        String digestInput = String.join(
                "|",
                nullToEmpty(connectionId),
                nullToEmpty(nodeId),
                Long.toString(cacheVersion),
                Integer.toString(count),
                firstId,
                lastId
        );
        return "\"dw-" + Integer.toHexString(digestInput.hashCode()) + "\"";
    }

    public static boolean matches(String ifNoneMatch, String etag) {
        if (ifNoneMatch == null || ifNoneMatch.isBlank() || etag == null || etag.isBlank()) {
            return false;
        }
        String normalized = stripQuotes(etag);
        for (String candidate : ifNoneMatch.split(",")) {
            if (normalized.equals(stripQuotes(candidate.trim()))) {
                return true;
            }
        }
        return false;
    }

    public static String stripQuotes(String etag) {
        if (etag == null) {
            return "";
        }
        String trimmed = etag.trim();
        if (trimmed.startsWith("W/\"")) {
            trimmed = trimmed.substring(3);
        } else if (trimmed.startsWith("\"")) {
            trimmed = trimmed.substring(1);
        }
        if (trimmed.endsWith("\"")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        return trimmed;
    }

    private static String nullToEmpty(String value) {
        return value != null ? value : "";
    }
}
