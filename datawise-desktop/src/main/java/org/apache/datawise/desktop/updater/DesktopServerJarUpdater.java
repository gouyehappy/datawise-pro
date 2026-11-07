package org.apache.datawise.desktop.updater;

import org.apache.datawise.desktop.DesktopPaths;

import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Comparator;
import java.util.Locale;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Replaces packaged {@code datawise-server.jar} from a {@code *-server-jar.zip}
 * (or a bare {@code .jar} named like datawise-server). Requires process relaunch.
 */
public final class DesktopServerJarUpdater {
    private DesktopServerJarUpdater() {
    }

    public static boolean isServerJarUpdateName(String name) {
        if (name == null) {
            return false;
        }
        String lower = name.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".zip") && lower.contains("server-jar")) {
            return true;
        }
        return lower.endsWith(".jar")
                && (lower.contains("datawise-server") || lower.contains("server-jar"));
    }

    public static Path apply(Path archive) throws Exception {
        if (archive == null || !Files.isRegularFile(archive)) {
            throw new IllegalArgumentException("server jar archive missing");
        }
        Path stagedJar = resolveJar(archive);
        Path target = resolveServerJarTarget();
        if (target == null) {
            throw new IllegalStateException("cannot locate packaged datawise-server.jar");
        }
        Files.createDirectories(target.getParent());
        Path backup = target.resolveSibling(target.getFileName() + ".bak-" + System.currentTimeMillis());
        if (Files.isRegularFile(target)) {
            Files.move(target, backup, StandardCopyOption.REPLACE_EXISTING);
        }
        try {
            Files.copy(stagedJar, target, StandardCopyOption.REPLACE_EXISTING);
            // Server jar fingerprint changed — drop AppCDS archive so the next launch
            // does not load a stale shared archive (JVM would fail-open, but avoid ClassVerify noise).
            invalidateAppCdsBeside(target);
            return target;
        } catch (Exception e) {
            if (Files.isRegularFile(backup) && !Files.isRegularFile(target)) {
                Files.move(backup, target, StandardCopyOption.REPLACE_EXISTING);
            }
            throw e;
        }
    }

    /** Remove {@code datawise.jsa} (+ meta) next to the server jar and under {@code app/}. */
    private static void invalidateAppCdsBeside(Path serverJar) {
        Path parent = serverJar.getParent();
        if (parent == null) {
            return;
        }
        deleteIfExists(parent.resolve("datawise.jsa"));
        deleteIfExists(parent.resolve("datawise.jsa.meta.json"));
        // jpackage layout: app/datawise-server.jar and app/datawise.jsa share the same dir.
        // Also clear backend/ sibling copies used by .cmd/.sh fallback launchers.
        Path install = DesktopPaths.installRoot();
        deleteIfExists(install.resolve("app").resolve("datawise.jsa"));
        deleteIfExists(install.resolve("app").resolve("datawise.jsa.meta.json"));
        deleteIfExists(install.resolve("backend").resolve("datawise.jsa"));
        deleteIfExists(install.resolve("backend").resolve("datawise.jsa.meta.json"));
    }

    private static void deleteIfExists(Path path) {
        try {
            Files.deleteIfExists(path);
        } catch (Exception ignored) {
        }
    }

    private static Path resolveJar(Path archive) throws Exception {
        String lower = archive.getFileName().toString().toLowerCase(Locale.ROOT);
        if (lower.endsWith(".jar")) {
            return archive;
        }
        Path work = DesktopPaths.userDataDir().resolve("updates").resolve("server-jar-apply");
        deleteRecursive(work);
        Files.createDirectories(work);
        unzip(archive, work);
        Path nested = work.resolve("backend").resolve("datawise-server.jar");
        if (Files.isRegularFile(nested)) {
            return nested;
        }
        Path flat = work.resolve("datawise-server.jar");
        if (Files.isRegularFile(flat)) {
            return flat;
        }
        try (Stream<Path> walk = Files.walk(work, 4)) {
            return walk
                    .filter(p -> p.getFileName() != null
                            && "datawise-server.jar".equalsIgnoreCase(p.getFileName().toString()))
                    .findFirst()
                    .orElseThrow(() -> new IllegalStateException("zip missing datawise-server.jar"));
        }
    }

    private static Path resolveServerJarTarget() {
        Path install = DesktopPaths.installRoot();
        Path[] candidates = {
                install.resolve("backend").resolve("datawise-server.jar"),
                install.resolve("resources").resolve("backend").resolve("datawise-server.jar"),
                install.resolve("Contents").resolve("backend").resolve("datawise-server.jar"),
                install.resolve("Contents").resolve("app").resolve("datawise-server.jar"),
                install.resolve("app").resolve("datawise-server.jar"),
                install.resolve("DataWiseCLI.app").resolve("Contents").resolve("backend").resolve("datawise-server.jar"),
                install.resolve("DataWiseCLI.app").resolve("Contents").resolve("app").resolve("datawise-server.jar"),
        };
        Path fallback = null;
        for (Path candidate : candidates) {
            if (Files.isRegularFile(candidate)) {
                return candidate;
            }
            Path parent = candidate.getParent();
            if (parent != null && Files.isDirectory(parent) && fallback == null) {
                fallback = candidate;
            }
        }
        return fallback;
    }

    private static void unzip(Path zipFile, Path dest) throws Exception {
        try (ZipInputStream zis = new ZipInputStream(Files.newInputStream(zipFile))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                Path out = dest.resolve(entry.getName()).normalize();
                if (!out.startsWith(dest)) {
                    throw new IllegalStateException("zip slip: " + entry.getName());
                }
                if (entry.isDirectory()) {
                    Files.createDirectories(out);
                } else {
                    Files.createDirectories(out.getParent());
                    try (OutputStream os = Files.newOutputStream(out)) {
                        zis.transferTo(os);
                    }
                }
            }
        }
    }

    private static void deleteRecursive(Path root) throws Exception {
        if (!Files.exists(root)) {
            return;
        }
        try (Stream<Path> walk = Files.walk(root)) {
            walk.sorted(Comparator.reverseOrder()).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (Exception ignored) {
                }
            });
        }
    }
}
