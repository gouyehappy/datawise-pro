package org.apache.datawise.desktop.util;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

/** Lightweight git status for local-files workspace decoration (no staging/commit). */
public final class DesktopGitUtil {
    private static final long TIMEOUT_SECONDS = 8L;
    private static final int MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
    private static final int MAX_ENTRIES = 5000;

    private DesktopGitUtil() {
    }

    /**
     * Run {@code git status --porcelain=v1 -uall} in {@code workspaceRoot}.
     * Porcelain paths are relative to the repository root (not the workspace cwd).
     * Returns {@code {ok, insideRepo, repoRoot, entries:[{path, xy}]}} — never throws for "not a repo".
     * <p>
     * Note: do not pass {@code --relative}; many Git builds (incl. Git for Windows) reject it on
     * {@code status}, which previously made the whole call fail with {@code ok:false}.
     */
    public static JsonObject status(Path workspaceRoot) {
        JsonObject out = new JsonObject();
        if (workspaceRoot == null || !Files.isDirectory(workspaceRoot)) {
            out.addProperty("ok", false);
            out.addProperty("error", "not_a_directory");
            return out;
        }
        Path abs = workspaceRoot.toAbsolutePath().normalize();
        try {
            if (!isInsideWorkTree(abs)) {
                out.addProperty("ok", true);
                out.addProperty("insideRepo", false);
                out.addProperty("repoRoot", "");
                out.add("entries", new JsonArray());
                return out;
            }
            String repoRoot = runGit(abs, List.of("rev-parse", "--show-toplevel")).trim();
            // Porcelain paths are always relative to the repository root.
            String porcelain = runGit(abs, List.of(
                    "status",
                    "--porcelain=v1",
                    "-uall"
            ));
            JsonArray entries = parsePorcelain(porcelain);
            out.addProperty("ok", true);
            out.addProperty("insideRepo", true);
            out.addProperty("repoRoot", repoRoot.replace('\\', '/'));
            out.add("entries", entries);
            return out;
        } catch (Exception e) {
            out.addProperty("ok", false);
            out.addProperty("error", e.getMessage() == null ? "git_failed" : e.getMessage());
            return out;
        }
    }

    /**
     * Line-level diff vs HEAD for a single file (unified -U0 text).
     * {@code git diff} exit 1 with hunks is success. Untracked files return {@code untracked:true}.
     */
    public static JsonObject fileDiff(Path filePath) {
        JsonObject out = new JsonObject();
        if (filePath == null || !Files.isRegularFile(filePath)) {
            out.addProperty("ok", false);
            out.addProperty("error", "not_a_file");
            return out;
        }
        Path abs = filePath.toAbsolutePath().normalize();
        Path cwd = abs.getParent();
        if (cwd == null) {
            out.addProperty("ok", false);
            out.addProperty("error", "no_parent");
            return out;
        }
        try {
            if (!isInsideWorkTree(cwd)) {
                out.addProperty("ok", true);
                out.addProperty("insideRepo", false);
                out.addProperty("untracked", false);
                out.addProperty("diff", "");
                return out;
            }
            Path repoRoot = Path.of(runGit(cwd, List.of("rev-parse", "--show-toplevel")).trim());
            String relative = repoRoot.relativize(abs).toString().replace('\\', '/');
            if (relative.startsWith("..")) {
                out.addProperty("ok", false);
                out.addProperty("error", "outside_repo");
                return out;
            }
            boolean tracked = isTracked(repoRoot, relative);
            out.addProperty("ok", true);
            out.addProperty("insideRepo", true);
            out.addProperty("untracked", !tracked);
            if (!tracked) {
                out.addProperty("diff", "");
                return out;
            }
            // Capture stderr separately so CRLF warnings don't pollute the diff text.
            String diff = runGitAllowExit(
                    repoRoot,
                    List.of("diff", "-U0", "--no-color", "--no-ext-diff", "HEAD", "--", relative),
                    List.of(0, 1),
                    false
            );
            out.addProperty("diff", diff == null ? "" : diff);
            return out;
        } catch (Exception e) {
            out.addProperty("ok", false);
            out.addProperty("error", e.getMessage() == null ? "git_failed" : e.getMessage());
            return out;
        }
    }

    private static boolean isTracked(Path repoRoot, String relativePosix) throws IOException, InterruptedException {
        try {
            String listed = runGit(repoRoot, List.of("ls-files", "--", relativePosix)).trim();
            return !listed.isEmpty();
        } catch (IOException ex) {
            return false;
        }
    }

    private static boolean isInsideWorkTree(Path cwd) throws IOException, InterruptedException {
        try {
            String text = runGit(cwd, List.of("rev-parse", "--is-inside-work-tree")).trim();
            return "true".equalsIgnoreCase(text);
        } catch (IOException ex) {
            String msg = ex.getMessage() == null ? "" : ex.getMessage().toLowerCase();
            if (msg.contains("not a git repository") || msg.contains("not a git repo")) {
                return false;
            }
            // git missing from PATH
            if (msg.contains("cannot run program") || msg.contains("error=2") || msg.contains("no such file")) {
                return false;
            }
            throw ex;
        }
    }

    private static JsonArray parsePorcelain(String porcelain) {
        JsonArray entries = new JsonArray();
        if (porcelain == null || porcelain.isBlank()) {
            return entries;
        }
        String[] lines = porcelain.replace("\r\n", "\n").split("\n");
        for (String raw : lines) {
            if (entries.size() >= MAX_ENTRIES) break;
            String line = raw;
            if (line.isEmpty()) continue;
            if (line.length() < 3) continue;
            String xy = line.substring(0, 2);
            String pathPart = line.substring(2).trim();
            if (pathPart.isEmpty()) continue;
            // rename: "old -> new"
            int arrow = pathPart.indexOf(" -> ");
            if (arrow >= 0) {
                pathPart = pathPart.substring(arrow + 4).trim();
            }
            // quoted path
            if (pathPart.length() >= 2 && pathPart.startsWith("\"") && pathPart.endsWith("\"")) {
                pathPart = unescapeGitQuotedPath(pathPart.substring(1, pathPart.length() - 1));
            }
            if (pathPart.isEmpty()) continue;
            JsonObject entry = new JsonObject();
            entry.addProperty("path", pathPart.replace('\\', '/'));
            entry.addProperty("xy", xy);
            entries.add(entry);
        }
        return entries;
    }

    private static String unescapeGitQuotedPath(String quoted) {
        StringBuilder sb = new StringBuilder(quoted.length());
        for (int i = 0; i < quoted.length(); i++) {
            char c = quoted.charAt(i);
            if (c == '\\' && i + 1 < quoted.length()) {
                char n = quoted.charAt(++i);
                switch (n) {
                    case 'n' -> sb.append('\n');
                    case 't' -> sb.append('\t');
                    case '"' -> sb.append('"');
                    case '\\' -> sb.append('\\');
                    default -> sb.append(n);
                }
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    private static String runGit(Path cwd, List<String> args) throws IOException, InterruptedException {
        return runGitAllowExit(cwd, args, List.of(0), true);
    }

    private static String runGitAllowExit(
            Path cwd,
            List<String> args,
            List<Integer> allowedExits,
            boolean mergeErrorStream
    ) throws IOException, InterruptedException {
        List<String> cmd = new ArrayList<>(args.size() + 1);
        cmd.add("git");
        cmd.addAll(args);
        ProcessBuilder pb = new ProcessBuilder(cmd);
        pb.directory(cwd.toFile());
        pb.redirectErrorStream(mergeErrorStream);
        Process process = pb.start();
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        try (InputStream in = process.getInputStream()) {
            byte[] chunk = new byte[8192];
            int read;
            while ((read = in.read(chunk)) >= 0) {
                if (buf.size() + read > MAX_OUTPUT_BYTES) {
                    process.destroyForcibly();
                    throw new IOException("git output too large");
                }
                buf.write(chunk, 0, read);
            }
        }
        if (!mergeErrorStream) {
            // Drain stderr so the process can exit cleanly.
            try (InputStream err = process.getErrorStream()) {
                err.transferTo(OutputStream.nullOutputStream());
            }
        }
        boolean finished = process.waitFor(TIMEOUT_SECONDS, TimeUnit.SECONDS);
        if (!finished) {
            process.destroyForcibly();
            throw new IOException("git timed out");
        }
        String text = buf.toString(StandardCharsets.UTF_8);
        int code = process.exitValue();
        if (!allowedExits.contains(code)) {
            throw new IOException(text.isBlank() ? ("git exit " + code) : text.trim());
        }
        return text;
    }
}
