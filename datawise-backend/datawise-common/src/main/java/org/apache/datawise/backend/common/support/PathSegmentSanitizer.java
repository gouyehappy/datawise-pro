package org.apache.datawise.backend.common.support;

import java.util.Locale;

/**
 * 文件路径片段消毒，防止目录穿越与非法字符
 */
public final class PathSegmentSanitizer {

    private PathSegmentSanitizer() {
    }

    public static String sanitize(String raw, String fallback) {
        if (raw == null || raw.isBlank()) {
            return fallback;
        }
        String cleaned = raw.trim()
                .replace('\\', '-')
                .replace('/', '-')
                .replaceAll("[^a-zA-Z0-9._\\- \\u4e00-\\u9fff]", "-")
                .replaceAll("-{2,}", "-")
                .replaceAll("^\\.+", "")
                .trim();
        if (cleaned.isBlank()) {
            return fallback;
        }
        return cleaned.length() > 120 ? cleaned.substring(0, 120) : cleaned;
    }

    private static boolean isValidSqlStem(String stem) {
        if (stem == null || stem.isBlank()) {
            return false;
        }
        if (stem.matches("^[-_.]+$")) {
            return false;
        }
        for (int i = 0; i < stem.length(); i++) {
            char ch = stem.charAt(i);
            if (Character.isLetterOrDigit(ch) || (ch >= '\u4e00' && ch <= '\u9fff')) {
                return true;
            }
        }
        return false;
    }

    private static String stripSqlExtension(String name) {
        if (name == null) {
            return "";
        }
        String trimmed = name.trim();
        if (trimmed.toLowerCase(Locale.ROOT).endsWith(".sql")) {
            return trimmed.substring(0, trimmed.length() - 4).trim();
        }
        return trimmed;
    }

    /**
     * 用户指定的 SQL 文件名：非法时抛错，避免落盘为 "-.sql" 等
     */
    public static String requireSqlFileName(String raw) {
        String stem = sanitize(stripSqlExtension(raw), "");
        if (!isValidSqlStem(stem)) {
            throw new IllegalArgumentException("Invalid SQL file name");
        }
        String withExt = stem + ".sql";
        return withExt.length() > 124 ? withExt.substring(0, 124) : withExt;
    }

    public static String sanitizeFileName(String raw, String fallback) {
        String base = sanitize(raw, fallback);
        if (!base.toLowerCase(Locale.ROOT).endsWith(".sql")) {
            base = base + ".sql";
        }
        return base;
    }

    private static String stripViewModelExtension(String name) {
        if (name == null) {
            return "";
        }
        String trimmed = name.trim();
        String lower = trimmed.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".view.sql")) {
            return trimmed.substring(0, trimmed.length() - 9).trim();
        }
        return stripSqlExtension(trimmed);
    }

    /**
     * 视图模型文件名：非法时抛错，统一落盘为 {@code {stem}.view.sql}
     */
    public static String requireViewModelFileName(String raw) {
        String stem = sanitize(stripViewModelExtension(raw), "");
        if (!isValidSqlStem(stem)) {
            throw new IllegalArgumentException("Invalid view model name");
        }
        String withExt = stem + ".view.sql";
        return withExt.length() > 132 ? withExt.substring(0, 132) : withExt;
    }

    public static String sanitizeViewModelFileName(String raw, String fallback) {
        String base = sanitize(stripViewModelExtension(raw), stripViewModelExtension(fallback));
        if (!base.toLowerCase(Locale.ROOT).endsWith(".view.sql")) {
            base = base + ".view.sql";
        }
        return base;
    }

    public static String viewModelDisplayName(String fileName) {
        if (fileName == null || fileName.isBlank()) {
            return "";
        }
        String trimmed = fileName.trim();
        String lower = trimmed.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".view.sql")) {
            return trimmed.substring(0, trimmed.length() - 9);
        }
        return trimmed;
    }
}
