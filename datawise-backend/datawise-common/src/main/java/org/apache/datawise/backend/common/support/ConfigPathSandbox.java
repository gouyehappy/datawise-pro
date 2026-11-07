package org.apache.datawise.backend.common.support;

import java.nio.file.Path;

/**
 * Keeps secret / config file references inside an allowlisted root (no absolute paths, no {@code ..}).
 */
public final class ConfigPathSandbox {

    private ConfigPathSandbox() {
    }

    /**
     * Resolves {@code relativePath} under {@code root} and ensures the normalized result stays inside root.
     *
     * @throws IllegalArgumentException if path is absolute, empty, or escapes root
     */
    public static Path resolveInside(Path root, String relativePath) {
        if (root == null) {
            throw new IllegalArgumentException("config root is required");
        }
        if (relativePath == null || relativePath.isBlank()) {
            throw new IllegalArgumentException("path is required");
        }
        String trimmed = relativePath.trim();
        Path candidate = Path.of(trimmed);
        if (candidate.isAbsolute()) {
            throw new IllegalArgumentException("absolute secret paths are not allowed: " + trimmed);
        }
        for (Path part : candidate) {
            String name = part.toString();
            if ("..".equals(name)) {
                throw new IllegalArgumentException("path traversal is not allowed: " + trimmed);
            }
        }
        Path rootNormalized = root.toAbsolutePath().normalize();
        Path resolved = rootNormalized.resolve(trimmed).normalize();
        if (!resolved.startsWith(rootNormalized)) {
            throw new IllegalArgumentException("path escapes config directory: " + trimmed);
        }
        return resolved;
    }
}
