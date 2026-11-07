package org.apache.datawise.backend.backup;

import org.apache.datawise.backend.config.BackupProperties;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

/** Validates and resolves backup destination paths. */
public final class BackupPathSanitizer {

    private BackupPathSanitizer() {
    }

    public static Path resolveDestinationRoot(
            ConfigDirectoryService configDirectory,
            BackupProperties properties,
            String destinationRoot
    ) {
        if (destinationRoot == null || destinationRoot.isBlank()) {
            return configDirectory.resolve(properties.getDefaultRoot()).normalize();
        }
        if (!properties.isAllowCustomRoot()) {
            throw new IllegalArgumentException("custom backup root is disabled");
        }
        Path resolved = Paths.get(destinationRoot.trim()).toAbsolutePath().normalize();
        rejectEscape(resolved);
        List<String> allowlist = properties.getCustomRootAllowlist();
        if (allowlist != null && !allowlist.isEmpty()) {
            boolean allowed = allowlist.stream()
                    .filter(item -> item != null && !item.isBlank())
                    .map(item -> Paths.get(item.trim()).toAbsolutePath().normalize())
                    .anyMatch(prefix -> resolved.startsWith(prefix));
            if (!allowed) {
                throw new IllegalArgumentException("backup root not in allowlist: " + resolved);
            }
        }
        return resolved;
    }

    public static void rejectEscape(Path path) {
        if (path == null) {
            throw new IllegalArgumentException("path is required");
        }
        for (Path part : path) {
            String name = part.toString();
            if ("..".equals(name)) {
                throw new IllegalArgumentException("path traversal is not allowed");
            }
        }
    }

    public static String artifactTimestamp() {
        return java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss")
                .withZone(java.time.ZoneOffset.UTC)
                .format(java.time.Instant.now());
    }
}
