package org.apache.datawise.backend.domain;

import org.apache.datawise.backend.model.ConnectionEntity;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** 连接所属/共享项目判定。 */
public final class ProjectConnectionMembership {

    private ProjectConnectionMembership() {
    }

    public static boolean belongsToProject(ConnectionEntity connection, String projectId) {
        if (connection == null) {
            return false;
        }
        String target = ProjectIds.normalizeOrDefault(projectId);
        String primary = ProjectIds.normalizeOrDefault(connection.getProjectId());
        if (target.equals(primary)) {
            return true;
        }
        for (String shared : normalizeSharedIds(connection.getSharedProjectIds())) {
            if (target.equals(shared)) {
                return true;
            }
        }
        return false;
    }

    public static List<String> normalizeSharedIds(List<String> raw) {
        if (raw == null || raw.isEmpty()) {
            return List.of();
        }
        Set<String> ids = new LinkedHashSet<>();
        for (String item : raw) {
            if (item == null || item.isBlank()) {
                continue;
            }
            ids.add(item.trim());
        }
        return new ArrayList<>(ids);
    }

    public static List<String> parseSharedIdsAttribute(String raw) {
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        String[] parts = raw.split("[,;\\s]+");
        Set<String> ids = new LinkedHashSet<>();
        for (String part : parts) {
            if (part != null && !part.isBlank()) {
                ids.add(part.trim());
            }
        }
        return new ArrayList<>(ids);
    }

    public static String formatSharedIdsAttribute(List<String> ids) {
        List<String> normalized = normalizeSharedIds(ids);
        if (normalized.isEmpty()) {
            return "";
        }
        return String.join(",", normalized);
    }

    public static String normalizeTemplateId(String templateId) {
        if (templateId == null || templateId.isBlank()) {
            return ProjectTemplates.BLANK;
        }
        String normalized = templateId.trim().toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case ProjectTemplates.ECOMMERCE, "e-commerce", "电商" -> ProjectTemplates.ECOMMERCE;
            case ProjectTemplates.DATA_PLATFORM, "data-mid", "数据中台" -> ProjectTemplates.DATA_PLATFORM;
            default -> ProjectTemplates.BLANK;
        };
    }

    public static String normalizeDefaultEnv(String env) {
        if (env == null || env.isBlank()) {
            return null;
        }
        String value = env.trim().toLowerCase(Locale.ROOT);
        return switch (value) {
            case "dev", "development" -> "dev";
            case "staging", "stage", "uat" -> "staging";
            case "prod", "production", "生产" -> "prod";
            case "custom" -> "custom";
            default -> value.length() > 64 ? value.substring(0, 64) : value;
        };
    }
}
