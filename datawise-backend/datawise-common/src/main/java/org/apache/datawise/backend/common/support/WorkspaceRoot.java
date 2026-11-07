package org.apache.datawise.backend.common.support;

import java.nio.file.Path;

/**
 * Absolute host workspace directory. The folder name is chosen by the user
 * ({@code datawise.config.dir}); callers must not assume it is named {@code config}.
 */
public final class WorkspaceRoot {

    private static final String SYS_PROP = "datawise.config.dir";

    private static volatile Path root;

    private WorkspaceRoot() {
    }

    public static void install(Path resolvedRoot) {
        if (resolvedRoot == null) {
            return;
        }
        root = resolvedRoot.toAbsolutePath().normalize();
    }

    public static Path require() {
        Path installed = root;
        if (installed != null) {
            return installed;
        }
        String property = System.getProperty(SYS_PROP);
        if (property != null && !property.isBlank()) {
            Path path = Path.of(property.trim());
            if (path.isAbsolute()) {
                return path.normalize();
            }
        }
        throw new IllegalStateException("Host workspace directory is not initialized");
    }
}
