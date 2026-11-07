package org.apache.datawise.desktop.util;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.awt.Desktop;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Stream;

public final class DesktopFsUtil {
    public static final long MAX_READ_TEXT_BYTES = 512 * 1024L;
    public static final long MAX_WRITE_TEXT_BYTES = 512 * 1024L;
    public static final long MAX_WRITE_BINARY_BYTES = 32L * 1024 * 1024;
    /** Local markdown preview images (screenshots can be a few MB). */
    public static final long MAX_READ_BINARY_BYTES = 12 * 1024 * 1024L;

    private DesktopFsUtil() {
    }

    public static void revealInExplorer(Path path) throws IOException {
        Path target = Files.exists(path) ? path : path.getParent();
        if (target == null || !Files.exists(target)) {
            throw new IOException("path not found: " + path);
        }
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        if (os.contains("win")) {
            new ProcessBuilder("explorer.exe", "/select,", target.toAbsolutePath().normalize().toString())
                    .start();
            return;
        }
        if (os.contains("mac")) {
            new ProcessBuilder("open", "-R", target.toAbsolutePath().normalize().toString()).start();
            return;
        }
        Path open = Files.isDirectory(target) ? target : target.getParent();
        if (open != null && Desktop.isDesktopSupported()) {
            Desktop.getDesktop().open(open.toFile());
        }
    }

    public static String readTextFile(Path path) throws IOException {
        if (!Files.isRegularFile(path)) {
            throw new IOException("not a file: " + path);
        }
        long size = Files.size(path);
        if (size > MAX_READ_TEXT_BYTES) {
            throw new IOException("file too large (" + size + " bytes, max " + MAX_READ_TEXT_BYTES + ")");
        }
        return Files.readString(path, StandardCharsets.UTF_8);
    }

    private static final Map<String, String> IMAGE_MIME = Map.ofEntries(
            Map.entry(".png", "image/png"),
            Map.entry(".jpg", "image/jpeg"),
            Map.entry(".jpeg", "image/jpeg"),
            Map.entry(".gif", "image/gif"),
            Map.entry(".webp", "image/webp"),
            Map.entry(".svg", "image/svg+xml"),
            Map.entry(".ico", "image/x-icon"),
            Map.entry(".bmp", "image/bmp")
    );

    /** Read a small binary file as a {@code data:} URL (for markdown preview images). */
    public static String readFileDataUrl(Path path) throws IOException {
        if (!Files.isRegularFile(path)) {
            throw new IOException("not a file: " + path);
        }
        long size = Files.size(path);
        if (size > MAX_READ_BINARY_BYTES) {
            throw new IOException("file too large (" + size + " bytes, max " + MAX_READ_BINARY_BYTES + ")");
        }
        String name = path.getFileName() == null ? "" : path.getFileName().toString().toLowerCase(Locale.ROOT);
        String mime = "application/octet-stream";
        int dot = name.lastIndexOf('.');
        if (dot >= 0) {
            String ext = name.substring(dot);
            String mapped = IMAGE_MIME.get(ext);
            if (mapped != null) {
                mime = mapped;
            }
        }
        byte[] bytes = Files.readAllBytes(path);
        return "data:" + mime + ";base64," + Base64.getEncoder().encodeToString(bytes);
    }

    public static void writeTextFile(Path path, String content) throws IOException {
        if (path == null) {
            throw new IOException("empty_path");
        }
        String text = content == null ? "" : content;
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_WRITE_TEXT_BYTES) {
            throw new IOException("content too large (" + bytes.length + " bytes, max " + MAX_WRITE_TEXT_BYTES + ")");
        }
        Path parent = path.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        Files.writeString(path, text, StandardCharsets.UTF_8);
    }

    public static void writeBinaryBase64(Path path, String base64) throws IOException {
        if (path == null) {
            throw new IOException("empty_path");
        }
        if (base64 == null || base64.isBlank()) {
            throw new IOException("empty_content");
        }
        String payload = base64.trim();
        int comma = payload.indexOf(',');
        if (payload.startsWith("data:") && comma >= 0) {
            payload = payload.substring(comma + 1);
        }
        byte[] bytes = Base64.getDecoder().decode(payload);
        if (bytes.length > MAX_WRITE_BINARY_BYTES) {
            throw new IOException("content too large (" + bytes.length + " bytes, max " + MAX_WRITE_BINARY_BYTES + ")");
        }
        Path parent = path.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        Files.write(path, bytes);
    }

    public static JsonArray listDir(Path dir, boolean includeHidden) throws IOException {
        if (!Files.isDirectory(dir)) {
            throw new IOException("not a directory: " + dir);
        }
        List<JsonObject> entries = new ArrayList<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(dir)) {
            for (Path child : stream) {
                String name = child.getFileName() != null ? child.getFileName().toString() : child.toString();
                if (!includeHidden && name.startsWith(".")) {
                    continue;
                }
                BasicFileAttributes attrs;
                try {
                    attrs = Files.readAttributes(child, BasicFileAttributes.class);
                } catch (IOException ex) {
                    continue;
                }
                JsonObject entry = new JsonObject();
                entry.addProperty("name", name);
                entry.addProperty("path", child.toAbsolutePath().normalize().toString());
                entry.addProperty("isDirectory", attrs.isDirectory());
                entry.addProperty("size", attrs.isRegularFile() ? attrs.size() : 0L);
                entry.addProperty("mtimeMs", attrs.lastModifiedTime().toMillis());
                entries.add(entry);
            }
        }
        entries.sort(Comparator
                .comparing((JsonObject o) -> !o.get("isDirectory").getAsBoolean())
                .thenComparing(o -> o.get("name").getAsString(), String.CASE_INSENSITIVE_ORDER));
        JsonArray out = new JsonArray();
        for (JsonObject entry : entries) {
            out.add(entry);
        }
        return out;
    }

    public static Path mkdir(Path path) throws IOException {
        return Files.createDirectories(path);
    }

    /** Lightweight metadata lookup (exists / type / size / mtime). */
    public static JsonObject stat(Path path) throws IOException {
        JsonObject out = new JsonObject();
        if (path == null) {
            out.addProperty("exists", false);
            return out;
        }
        if (!Files.exists(path)) {
            out.addProperty("exists", false);
            out.addProperty("path", path.toAbsolutePath().normalize().toString());
            return out;
        }
        BasicFileAttributes attrs = Files.readAttributes(path, BasicFileAttributes.class);
        out.addProperty("exists", true);
        out.addProperty("path", path.toAbsolutePath().normalize().toString());
        out.addProperty("isDirectory", attrs.isDirectory());
        out.addProperty("size", attrs.isRegularFile() ? attrs.size() : 0L);
        out.addProperty("mtimeMs", attrs.lastModifiedTime().toMillis());
        return out;
    }

    public static void rename(Path source, Path target) throws IOException {
        if (!Files.exists(source)) {
            throw new IOException("path not found: " + source);
        }
        if (Files.exists(target)) {
            throw new IOException("target exists: " + target);
        }
        Path parent = target.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        try {
            Files.move(source, target, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException ex) {
            Files.move(source, target);
        }
    }

    public static void delete(Path path, boolean recursive) throws IOException {
        if (!Files.exists(path)) {
            throw new IOException("path not found: " + path);
        }
        if (Files.isDirectory(path)) {
            if (recursive) {
                try (Stream<Path> walk = Files.walk(path)) {
                    List<Path> sorted = walk.sorted(Comparator.reverseOrder()).toList();
                    for (Path p : sorted) {
                        Files.deleteIfExists(p);
                    }
                }
                return;
            }
            try (DirectoryStream<Path> stream = Files.newDirectoryStream(path)) {
                if (stream.iterator().hasNext()) {
                    throw new IOException("directory_not_empty");
                }
            }
            Files.delete(path);
            return;
        }
        Files.delete(path);
    }

    public static void openInTerminal(Path path) throws IOException {
        Path target = Files.isDirectory(path) ? path : (path.getParent() != null ? path.getParent() : path);
        if (!Files.isDirectory(target)) {
            throw new IOException("not a directory: " + target);
        }
        String abs = target.toAbsolutePath().normalize().toString();
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        if (os.contains("win")) {
            new ProcessBuilder("cmd.exe", "/c", "start", "cmd.exe", "/k", "cd /d \"" + abs + "\"").start();
            return;
        }
        if (os.contains("mac")) {
            String escaped = abs.replace("\\", "\\\\").replace("\"", "\\\"");
            String script = "tell application \"Terminal\" to do script \"cd \\\"" + escaped + "\\\"\"";
            new ProcessBuilder("osascript", "-e", script).start();
            return;
        }
        List<String[]> candidates = List.of(
                new String[]{"x-terminal-emulator", "--working-directory", abs},
                new String[]{"gnome-terminal", "--working-directory", abs},
                new String[]{"konsole", "--workdir", abs},
                new String[]{"xfce4-terminal", "--working-directory", abs},
                new String[]{"xterm", "-e", "bash", "-lc", "cd '" + abs.replace("'", "'\\''") + "'; exec bash"}
        );
        IOException last = null;
        for (String[] cmd : candidates) {
            try {
                new ProcessBuilder(cmd).start();
                return;
            } catch (IOException ex) {
                last = ex;
            }
        }
        throw last != null ? last : new IOException("no terminal found");
    }

    public static void openExternal(String url) throws IOException {
        if (url == null || url.isBlank()) {
            throw new IOException("empty url");
        }
        final URI uri;
        try {
            uri = URI.create(url.trim());
        } catch (IllegalArgumentException ex) {
            throw new IOException("invalid url", ex);
        }
        String scheme = uri.getScheme();
        if (scheme == null
                || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) {
            throw new IOException("unsupported url scheme (only http/https): " + scheme);
        }
        if (!Desktop.isDesktopSupported() || !Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
            throw new IOException("browse unsupported");
        }
        Desktop.getDesktop().browse(uri);
    }
}
