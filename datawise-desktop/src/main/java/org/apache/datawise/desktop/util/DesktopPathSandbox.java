package org.apache.datawise.desktop.util;

import java.nio.file.Path;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Session-scoped allowlist for desktop filesystem bridge channels.
 * Registered roots cover a whole tree; one-shot paths allow a single file (e.g. Open File).
 */
public final class DesktopPathSandbox {
    private final Set<Path> roots = ConcurrentHashMap.newKeySet();
    private final Set<Path> oneShotPaths = ConcurrentHashMap.newKeySet();

    public Path registerRoot(Path path) {
        if (path == null) {
            throw new IllegalArgumentException("empty_path");
        }
        Path normalized = path.toAbsolutePath().normalize();
        roots.add(normalized);
        return normalized;
    }

    public Path allowOneShot(Path path) {
        if (path == null) {
            throw new IllegalArgumentException("empty_path");
        }
        Path normalized = path.toAbsolutePath().normalize();
        oneShotPaths.add(normalized);
        return normalized;
    }

    public boolean isAllowed(Path path) {
        if (path == null) {
            return false;
        }
        Path normalized = path.toAbsolutePath().normalize();
        if (oneShotPaths.contains(normalized)) {
            return true;
        }
        for (Path root : roots) {
            if (normalized.startsWith(root)) {
                return true;
            }
        }
        return false;
    }

    public Path requireAllowed(Path path) {
        Path normalized = path == null ? null : path.toAbsolutePath().normalize();
        if (normalized == null || !isAllowed(normalized)) {
            throw new IllegalArgumentException("path_not_allowed");
        }
        return normalized;
    }

    public Set<Path> roots() {
        return Set.copyOf(roots);
    }

    public void clear() {
        roots.clear();
        oneShotPaths.clear();
    }
}
