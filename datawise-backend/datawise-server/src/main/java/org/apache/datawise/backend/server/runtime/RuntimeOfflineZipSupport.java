package org.apache.datawise.backend.server.runtime;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Safe selective extract for offline runtime connector/driver zips.
 *
 * <p>Zip layout (documented for packagers):
 * <pre>
 *   plugins/*.jar              → config/plugins/
 *   connectors/*.jar           → config/plugins/  (alias)
 *   drivers/*.jar              → config/drivers/
 *   drivers/&lt;bundle&gt;/*.jar   → config/drivers/&lt;bundle&gt;/
 *   runtime-catalog.json       → config/runtime-catalog.json (optional overlay)
 * </pre>
 *
 * <p>Zip-slip entries (absolute paths, {@code ..} segments) are rejected. Unknown paths are skipped.
 */
public final class RuntimeOfflineZipSupport {

    public static final String RUNTIME_CATALOG_FILE = "runtime-catalog.json";

    private RuntimeOfflineZipSupport() {
    }

    public record ExtractResult(
            List<String> pluginJars,
            List<String> driverJars,
            boolean catalogOverlay
    ) {
    }

    public static ExtractResult extract(
            Path zipFile,
            Path pluginsDir,
            Path driversDir,
            Path configRoot
    ) throws IOException {
        if (zipFile == null || !Files.isRegularFile(zipFile)) {
            throw new IllegalArgumentException("zip file not found: " + zipFile);
        }
        if (pluginsDir == null || driversDir == null || configRoot == null) {
            throw new IllegalArgumentException("pluginsDir, driversDir, and configRoot are required");
        }
        Path pluginsRoot = pluginsDir.toAbsolutePath().normalize();
        Path driversRoot = driversDir.toAbsolutePath().normalize();
        Path configAbs = configRoot.toAbsolutePath().normalize();
        Files.createDirectories(pluginsRoot);
        Files.createDirectories(driversRoot);
        Files.createDirectories(configAbs);

        List<String> pluginJars = new ArrayList<>();
        List<String> driverJars = new ArrayList<>();
        boolean catalogOverlay = false;

        try (InputStream in = Files.newInputStream(zipFile);
             ZipInputStream zip = new ZipInputStream(in)) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (entry.isDirectory()) {
                    continue;
                }
                String name = normalizeEntryName(entry.getName());
                if (name.isEmpty() || isJunkEntry(name)) {
                    continue;
                }
                ResolvedTarget target = resolveTarget(name, pluginsRoot, driversRoot, configAbs);
                if (target == null) {
                    continue;
                }
                Files.createDirectories(target.path().getParent());
                Files.copy(zip, target.path(), StandardCopyOption.REPLACE_EXISTING);
                switch (target.kind()) {
                    case PLUGIN -> pluginJars.add(target.path().getFileName().toString());
                    case DRIVER -> driverJars.add(driversRoot.relativize(target.path()).toString().replace('\\', '/'));
                    case CATALOG -> catalogOverlay = true;
                    default -> {
                    }
                }
            }
        }

        return new ExtractResult(List.copyOf(pluginJars), List.copyOf(driverJars), catalogOverlay);
    }

    static String normalizeEntryName(String raw) {
        if (raw == null) {
            return "";
        }
        String name = raw.replace('\\', '/').trim();
        while (name.startsWith("./")) {
            name = name.substring(2);
        }
        if (name.startsWith("/")) {
            throw new IllegalArgumentException("zip entry escapes target directory: " + raw);
        }
        if (name.contains("..")) {
            throw new IllegalArgumentException("zip entry escapes target directory: " + raw);
        }
        return name;
    }

    private static boolean isJunkEntry(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        return lower.startsWith("__macosx/") || lower.endsWith(".ds_store") || lower.endsWith("/.ds_store");
    }

    private enum Kind {
        PLUGIN, DRIVER, CATALOG
    }

    private record ResolvedTarget(Path path, Kind kind) {
    }

    private static ResolvedTarget resolveTarget(
            String name,
            Path pluginsRoot,
            Path driversRoot,
            Path configAbs
    ) {
        String lower = name.toLowerCase(Locale.ROOT);
        if (RUNTIME_CATALOG_FILE.equals(lower) || name.equals(RUNTIME_CATALOG_FILE)) {
            Path out = configAbs.resolve(RUNTIME_CATALOG_FILE).normalize();
            requireUnder(out, configAbs, name);
            return new ResolvedTarget(out, Kind.CATALOG);
        }
        if (lower.startsWith("plugins/") || lower.startsWith("connectors/")) {
            String fileName = name.substring(name.indexOf('/') + 1);
            if (fileName.contains("/") || fileName.contains("\\") || !fileName.toLowerCase(Locale.ROOT).endsWith(".jar")) {
                return null;
            }
            Path out = pluginsRoot.resolve(fileName).normalize();
            requireUnder(out, pluginsRoot, name);
            return new ResolvedTarget(out, Kind.PLUGIN);
        }
        if (lower.startsWith("drivers/")) {
            String relative = name.substring("drivers/".length());
            if (relative.isBlank() || !relative.toLowerCase(Locale.ROOT).endsWith(".jar")) {
                return null;
            }
            // Allow flat jar or one subdirectory (e.g. hive/x.jar); reject deeper nesting.
            String[] parts = relative.split("/");
            if (parts.length == 1) {
                if (parts[0].contains("..")) {
                    throw new IllegalArgumentException("zip entry escapes target directory: " + name);
                }
                Path out = driversRoot.resolve(parts[0]).normalize();
                requireUnder(out, driversRoot, name);
                return new ResolvedTarget(out, Kind.DRIVER);
            }
            if (parts.length == 2) {
                if (parts[0].isBlank() || parts[0].contains("..") || parts[1].contains("..")) {
                    throw new IllegalArgumentException("zip entry escapes target directory: " + name);
                }
                Path out = driversRoot.resolve(parts[0]).resolve(parts[1]).normalize();
                requireUnder(out, driversRoot, name);
                return new ResolvedTarget(out, Kind.DRIVER);
            }
            return null;
        }
        return null;
    }

    private static void requireUnder(Path candidate, Path root, String entryName) {
        if (!candidate.startsWith(root)) {
            throw new IllegalArgumentException("zip entry escapes target directory: " + entryName);
        }
    }
}
