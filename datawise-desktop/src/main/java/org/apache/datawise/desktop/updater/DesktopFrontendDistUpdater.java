package org.apache.datawise.desktop.updater;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.apache.datawise.desktop.DesktopPaths;

import java.io.InputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Applies a {@code *-frontend-dist.zip} incremental update over the packaged SPA.
 * Zip layout: {@code frontend-dist/**} plus optional root {@code local_version.json}.
 */
public final class DesktopFrontendDistUpdater {
    private DesktopFrontendDistUpdater() {
    }

    public static boolean isFrontendDistZipName(String name) {
        if (name == null) {
            return false;
        }
        String lower = name.toLowerCase();
        return lower.endsWith(".zip") && lower.contains("frontend-dist");
    }

    /**
     * Extract zip and replace {@link DesktopPaths#frontendDistRoot()}.
     *
     * @return absolute path of the updated frontend-dist root
     */
    public static Path apply(Path zipFile) throws Exception {
        if (zipFile == null || !Files.isRegularFile(zipFile)) {
            throw new IllegalArgumentException("frontend-dist zip missing");
        }
        Path work = DesktopPaths.userDataDir().resolve("updates").resolve("frontend-apply");
        deleteRecursive(work);
        Files.createDirectories(work);
        unzip(zipFile, work);

        Path staged = locateFrontendDist(work);
        if (staged == null || !Files.isRegularFile(staged.resolve("index.html"))) {
            throw new IllegalStateException("frontend-dist zip missing index.html");
        }

        Path target = DesktopPaths.frontendDistRoot();
        Files.createDirectories(target.getParent());
        Path backup = target.resolveSibling(target.getFileName() + ".bak-" + System.currentTimeMillis());
        if (Files.isDirectory(target)) {
            Files.move(target, backup, StandardCopyOption.REPLACE_EXISTING);
        }
        try {
            copyRecursive(staged, target);
            Path manifest = work.resolve("local_version.json");
            if (Files.isRegularFile(manifest)) {
                writeLocalVersionCopies(manifest);
            } else {
                rewriteLocalVersionForFrontend(target);
            }
            // Keep one backup; drop older backups later if needed.
            return target;
        } catch (Exception e) {
            if (Files.isDirectory(backup) && !Files.isDirectory(target)) {
                Files.move(backup, target, StandardCopyOption.REPLACE_EXISTING);
            }
            throw e;
        }
    }

    private static Path locateFrontendDist(Path work) throws Exception {
        Path nested = work.resolve("frontend-dist");
        if (Files.isDirectory(nested) && Files.isRegularFile(nested.resolve("index.html"))) {
            return nested;
        }
        if (Files.isRegularFile(work.resolve("index.html"))) {
            return work;
        }
        try (Stream<Path> stream = Files.walk(work, 3)) {
            return stream
                    .filter(p -> p.getFileName() != null && "index.html".equalsIgnoreCase(p.getFileName().toString()))
                    .map(Path::getParent)
                    .findFirst()
                    .orElse(null);
        }
    }

    private static void writeLocalVersionCopies(Path manifest) throws Exception {
        byte[] bytes = Files.readAllBytes(manifest);
        for (Path candidate : DesktopUpdaterService.localVersionCandidates()) {
            Path parent = candidate.getParent();
            if (parent == null) {
                continue;
            }
            if (!Files.isDirectory(parent)) {
                continue;
            }
            Files.write(candidate, bytes);
        }
        // Always ensure install-root copy when writable.
        Path install = DesktopPaths.installRoot().resolve("local_version.json");
        try {
            Files.createDirectories(install.getParent());
            Files.write(install, bytes);
        } catch (Exception ignored) {
        }
    }

    private static void rewriteLocalVersionForFrontend(Path frontendRoot) throws Exception {
        Path index = frontendRoot.resolve("index.html");
        String sha = sha256(index);
        long bytes = Files.size(index);
        for (Path candidate : DesktopUpdaterService.localVersionCandidates()) {
            if (!Files.isRegularFile(candidate)) {
                continue;
            }
            try {
                JsonObject obj = JsonParser.parseString(Files.readString(candidate, StandardCharsets.UTF_8))
                        .getAsJsonObject();
                JsonObject files = obj.has("files") && obj.get("files").isJsonObject()
                        ? obj.getAsJsonObject("files")
                        : new JsonObject();
                JsonObject entry = new JsonObject();
                entry.addProperty("sha256", sha);
                entry.addProperty("bytes", bytes);
                files.add("frontend-dist/index.html", entry);
                obj.add("files", files);
                Files.writeString(candidate, obj.toString(), StandardCharsets.UTF_8);
            } catch (Exception ignored) {
            }
        }
    }

    private static String sha256(Path file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream in = Files.newInputStream(file)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) >= 0) {
                digest.update(buf, 0, n);
            }
        }
        return HexFormat.of().formatHex(digest.digest());
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

    private static void copyRecursive(Path src, Path dest) throws IOException {
        Files.walkFileTree(src, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) throws IOException {
                Path rel = dest.resolve(src.relativize(dir).toString());
                Files.createDirectories(rel);
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                Path rel = dest.resolve(src.relativize(file).toString());
                Files.createDirectories(rel.getParent());
                Files.copy(file, rel, StandardCopyOption.REPLACE_EXISTING);
                return FileVisitResult.CONTINUE;
            }
        });
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
