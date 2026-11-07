package org.apache.datawise.desktop.backend;

import org.apache.datawise.desktop.DesktopPaths;
import org.apache.datawise.desktop.DesktopRuntimePorts;
import org.apache.datawise.desktop.prefs.DesktopPreferencesStore;
import org.apache.datawise.desktop.prefs.RuntimeJsonStore;
import org.apache.datawise.desktop.prefs.WorkspacePreferences;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;
import java.util.stream.Stream;

/**
 * Backend lifecycle for the desktop host.
 *
 * <ul>
 *   <li>{@code inProcess=false} — spawn {@code datawise-server.jar} (legacy / dual-process dev)</li>
 *   <li>{@code inProcess=true} — same JVM as Spring Boot; only bootstrap config + poll health</li>
 * </ul>
 */
public final class BackendProcessService {
    public enum Phase {idle, config, spawning, warming, ready, failed}

    public record StartupEvent(Phase phase, int progress) {
    }

    private static final String HEALTH_PATH = "/api/health";
    private static final long STARTUP_TIMEOUT_MS = 120_000L;
    private static final long HEALTH_POLL_MS = 150L;

    private final boolean packaged;
    private final boolean inProcess;
    private final AtomicReference<Process> process = new AtomicReference<>();
    private final AtomicReference<StartupEvent> latest =
            new AtomicReference<>(new StartupEvent(Phase.idle, 0));
    private final List<Consumer<StartupEvent>> listeners = new CopyOnWriteArrayList<>();
    private volatile String runtimeConfigDir = "";

    public BackendProcessService(boolean packaged) {
        this(packaged, false);
    }

    public BackendProcessService(boolean packaged, boolean inProcess) {
        this.packaged = packaged;
        this.inProcess = inProcess;
    }

    public boolean isInProcess() {
        return inProcess;
    }

    public void addListener(Consumer<StartupEvent> listener) {
        listeners.add(listener);
        StartupEvent current = latest.get();
        if (current.phase() != Phase.idle) {
            listener.accept(current);
        }
    }

    public StartupEvent getStartupState() {
        return latest.get();
    }

    public String getApiBaseUrl() {
        int port = packaged ? DesktopRuntimePorts.desktopBackend() : DesktopRuntimePorts.devBackend();
        return "http://127.0.0.1:" + port;
    }

    public String getRuntimeConfigDir() {
        return runtimeConfigDir;
    }

    private void emit(Phase phase, int progress) {
        StartupEvent event = new StartupEvent(phase, progress);
        latest.set(event);
        for (Consumer<StartupEvent> listener : listeners) {
            try {
                listener.accept(event);
            } catch (Exception ignored) {
            }
        }
    }

    public Path resolveDefaultConfigDir() {
        Path portable = DesktopPaths.portableDataRoot();
        if (portable != null) {
            return portable.resolve("workspaces");
        }
        return DesktopPaths.userDataDir().resolve("workspaces");
    }

    public Path resolveConfiguredConfigPath(String configured) {
        String trimmed = configured == null ? "" : configured.trim();
        if (trimmed.isEmpty()) {
            return resolveDefaultConfigDir();
        }
        Path path = Path.of(trimmed);
        if (path.isAbsolute()) {
            return path.normalize();
        }
        return Path.of(System.getProperty("user.dir")).resolve(path).normalize();
    }

    public Path resolveRuntimeConfigDir() {
        String configured = DesktopPreferencesStore.configDirOrNull();
        if (configured != null) {
            return resolveConfiguredConfigPath(configured);
        }
        return resolveDefaultConfigDir();
    }

    /**
     * Ensure workspace config exists.
     *
     * @return {@code true} when the directory was seeded from the install template (first launch)
     */
    public boolean bootstrapConfigDirectory(Path configDir) throws IOException {
        boolean seeded = false;
        if (!WorkspacePreferences.hasConfig(configDir)) {
            seedFromTemplate(configDir);
            RuntimeJsonStore.markSetupPending(configDir);
            DesktopPreferencesStore.setRuntimeSetupPending(true);
            seeded = true;
        }
        ensureSubdirs(configDir);
        return seeded;
    }

    private void seedFromTemplate(Path configDir) throws IOException {
        Path template = DesktopPaths.configBundleRoot(packaged);
        if (!Files.isDirectory(template)) {
            throw new IOException("Config template missing: " + template);
        }
        Files.createDirectories(configDir);
        copyRecursive(template, configDir);
        Files.createDirectories(configDir.resolve("logs"));
        appendLog(configDir, "workspaceInitializedFromTemplate=" + template);
    }

    private static void ensureSubdirs(Path configDir) throws IOException {
        for (String sub : List.of("logs", "plugins", "drivers", "cache/schema", "scripts", "exports", "ai-checkpoints")) {
            Files.createDirectories(configDir.resolve(sub));
        }
    }

    private static void copyRecursive(Path source, Path target) throws IOException {
        try (Stream<Path> walk = Files.walk(source)) {
            for (Path path : walk.toList()) {
                Path rel = source.relativize(path);
                Path dest = target.resolve(rel.toString());
                if (Files.isDirectory(path)) {
                    Files.createDirectories(dest);
                } else {
                    Files.createDirectories(dest.getParent());
                    Files.copy(path, dest, StandardCopyOption.REPLACE_EXISTING);
                }
            }
        }
    }

    public void startInBackground() {
        Thread t = new Thread(this::startBlocking, "datawise-backend-starter");
        t.setDaemon(true);
        t.start();
    }

    private void startBlocking() {
        try {
            emit(Phase.config, 8);
            Path configDir = resolveRuntimeConfigDir();
            bootstrapConfigDirectory(configDir);
            DesktopPreferencesStore.touchRecent(configDir.toString());
            runtimeConfigDir = configDir.toString();

            String baseUrl = getApiBaseUrl();
            if (inProcess) {
                waitForHealth(baseUrl, configDir, null);
                return;
            }

            if (tryReuseExistingBackend(baseUrl, configDir)) {
                return;
            }

            Path jar = resolveServerJar();
            if (jar == null) {
                emit(Phase.failed, 0);
                appendLog(configDir, "server jar not found under " + DesktopPaths.backendRoot(packaged));
                return;
            }

            emit(Phase.spawning, 22);
            JavaResolution java = resolveJavaExecutable(configDir);
            List<String> cmd = buildBackendCommand(java.path(), jar, configDir, java.source());

            ProcessBuilder pb = new ProcessBuilder(cmd);
            pb.directory(jar.getParent() != null ? jar.getParent().toFile() : new java.io.File("."));
            pb.redirectErrorStream(true);
            Process proc = pb.start();
            process.set(proc);
            drainAsync(proc, configDir);
            appendLog(configDir, "spawned backend configDir=" + configDir.toAbsolutePath()
                    + " port=" + listenPort());

            waitForHealth(baseUrl, configDir, proc);
        } catch (Exception e) {
            emit(Phase.failed, 0);
            try {
                Path dir = resolveRuntimeConfigDir();
                appendLog(dir, "backend start error: " + e.getMessage());
            } catch (Exception ignored) {
            }
        }
    }

    private void waitForHealth(String baseUrl, Path configDir, Process proc) throws InterruptedException {
        emit(Phase.warming, 38);
        appendLog(configDir, (inProcess ? "in-process" : "child")
                + " backend warming port=" + listenPort());
        long deadline = System.currentTimeMillis() + STARTUP_TIMEOUT_MS;
        int progress = 38;
        while (System.currentTimeMillis() < deadline) {
            if (proc != null && !proc.isAlive()) {
                emit(Phase.failed, 0);
                appendLog(configDir, "backend process exited early");
                return;
            }
            HealthProbe probe = probeHealth(baseUrl);
            if (probe.ok()) {
                emit(Phase.ready, 78);
                appendLog(configDir, "backend ready");
                org.apache.datawise.desktop.startup.DesktopStartupTiming.markHealthReady();
                return;
            }
            progress = Math.min(77, progress + 1);
            emit(Phase.warming, progress);
            Thread.sleep(HEALTH_POLL_MS);
        }
        emit(Phase.failed, 0);
        appendLog(configDir, "backend health timeout");
    }

    private List<String> buildBackendCommand(Path java, Path jar, Path configDir, String jreSource) {
        String absoluteConfig = configDir.toAbsolutePath().normalize().toString();
        String absoluteLogs = configDir.resolve("logs").toAbsolutePath().normalize().toString();
        List<String> cmd = new ArrayList<>();
        cmd.add(java.toString());
        cmd.add("-Dfile.encoding=UTF-8");
        cmd.add("-Djava.awt.headless=true");
        // System property + Spring arg：logging.dir 必须与工作区一致，否则「打开日志」对不上最新文件
        cmd.add("-Ddatawise.config.dir=" + absoluteConfig);
        cmd.add("-Ddatawise.logging.dir=" + absoluteLogs);
        cmd.add("-Ddatawise.runtime.jre.source=" + jreSource);
        cmd.add("-jar");
        cmd.add(jar.toAbsolutePath().toString());
        cmd.add("--server.port=" + listenPort());
        cmd.add("--server.address=127.0.0.1");
        cmd.add("--datawise.config.dir=" + absoluteConfig);
        cmd.add("--datawise.logging.dir=" + absoluteLogs);
        cmd.add("--spring.profiles.active=" + (packaged ? "desktop" : "dev"));
        return cmd;
    }

    private int listenPort() {
        return packaged ? DesktopRuntimePorts.desktopBackend() : DesktopRuntimePorts.devBackend();
    }

    /**
     * Reuse a live backend only when its reported workspace matches the expected one.
     * If configDir is missing/mismatched, free the port and spawn fresh.
     */
    private boolean tryReuseExistingBackend(String baseUrl, Path expectedConfigDir) throws InterruptedException {
        HealthProbe probe = probeHealth(baseUrl);
        if (!probe.ok()) {
            return false;
        }
        String expected = normalizeFsPath(expectedConfigDir.toString());
        String live = probe.configDir() == null ? "" : normalizeFsPath(probe.configDir());
        if (live.isBlank()) {
            appendLog(expectedConfigDir,
                    "reuse skipped: live backend has no configDir; freeing port " + listenPort());
            freeBackendListenPort();
            Thread.sleep(400L);
            return false;
        }
        if (!live.equals(expected)) {
            appendLog(expectedConfigDir,
                    "reuse skipped: live configDir=" + probe.configDir()
                            + " expected=" + expectedConfigDir + "; freeing port");
            freeBackendListenPort();
            Thread.sleep(400L);
            return false;
        }
        emit(Phase.spawning, 22);
        emit(Phase.warming, 58);
        emit(Phase.ready, 78);
        appendLog(expectedConfigDir, "reused live backend configDir=" + probe.configDir());
        org.apache.datawise.desktop.startup.DesktopStartupTiming.markHealthReady();
        return true;
    }

    private void freeBackendListenPort() {
        int port = listenPort();
        boolean win = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
        try {
            if (win) {
                Process list = new ProcessBuilder(
                        "powershell.exe",
                        "-NoProfile",
                        "-Command",
                        "(Get-NetTCPConnection -LocalPort " + port
                                + " -State Listen -ErrorAction SilentlyContinue).OwningProcess"
                                + " | Select-Object -Unique"
                ).redirectErrorStream(true).start();
                String out = new String(list.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
                list.waitFor(5, java.util.concurrent.TimeUnit.SECONDS);
                for (String line : out.split("\\R")) {
                    String trimmed = line.trim();
                    if (trimmed.isEmpty() || !trimmed.chars().allMatch(Character::isDigit)) {
                        continue;
                    }
                    long pid = Long.parseLong(trimmed);
                    if (pid <= 0) {
                        continue;
                    }
                    new ProcessBuilder("taskkill", "/T", "/F", "/PID", Long.toString(pid))
                            .redirectErrorStream(true)
                            .start()
                            .waitFor(3, java.util.concurrent.TimeUnit.SECONDS);
                }
            } else {
                Process list = new ProcessBuilder("lsof", "-t", "-iTCP:" + port, "-sTCP:LISTEN")
                        .redirectErrorStream(true)
                        .start();
                String out = new String(list.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
                list.waitFor(5, java.util.concurrent.TimeUnit.SECONDS);
                for (String line : out.split("\\R")) {
                    String trimmed = line.trim();
                    if (trimmed.isEmpty() || !trimmed.chars().allMatch(Character::isDigit)) {
                        continue;
                    }
                    long pid = Long.parseLong(trimmed);
                    if (pid > 0) {
                        new ProcessBuilder("kill", "-TERM", Long.toString(pid)).start()
                                .waitFor(2, java.util.concurrent.TimeUnit.SECONDS);
                    }
                }
            }
        } catch (Exception ignored) {
            // port free or tools unavailable
        }
    }

    private static String normalizeFsPath(String path) {
        String trimmed = path.trim().replaceAll("[/\\\\]+$", "");
        return trimmed.replace('\\', '/').toLowerCase(Locale.ROOT);
    }

    private void drainAsync(Process proc, Path configDir) {
        Thread t = new Thread(() -> {
            try (InputStream in = proc.getInputStream()) {
                byte[] buf = new byte[4096];
                int n;
                while ((n = in.read(buf)) >= 0) {
                    if (n > 0) {
                        appendLog(configDir, new String(buf, 0, n).trim());
                    }
                }
            } catch (Exception ignored) {
            }
        }, "datawise-backend-log");
        t.setDaemon(true);
        t.start();
    }

    public void stop() {
        stopInternal(false);
    }

    /** Fast path for tray Quit — no multi-second waits. */
    public void stopQuick() {
        stopInternal(true);
    }

    private void stopInternal(boolean quick) {
        if (inProcess) {
            // Same JVM as Spring — do not kill this process or free our own listen port.
            return;
        }
        Process proc = process.getAndSet(null);
        if (proc != null) {
            long pid = proc.pid();
            try {
                proc.destroyForcibly();
            } catch (Exception ignored) {
                try {
                    proc.destroy();
                } catch (Exception ignored2) {
                }
            }
            try {
                proc.waitFor(quick ? 50 : 1500, java.util.concurrent.TimeUnit.MILLISECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            if (System.getProperty("os.name", "").toLowerCase().contains("win") && pid > 0) {
                try {
                    Process kill = new ProcessBuilder("taskkill", "/T", "/F", "/PID", Long.toString(pid))
                            .redirectErrorStream(true)
                            .start();
                    if (quick) {
                        kill.getInputStream().close();
                    } else {
                        kill.waitFor(2000, java.util.concurrent.TimeUnit.MILLISECONDS);
                    }
                } catch (Exception ignored) {
                }
            }
        }
        if (!quick) {
            freeBackendListenPort();
        } else {
            Thread t = new Thread(this::freeBackendListenPort, "datawise-free-port");
            t.setDaemon(true);
            t.start();
        }
    }

    private record JavaResolution(Path path, String source) {
    }

    private JavaResolution resolveJavaExecutable(Path configDir) {
        Path backendRoot = DesktopPaths.backendRoot(packaged);
        Path install = DesktopPaths.installRoot();
        boolean win = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
        String javaName = win ? "java.exe" : "java";

        String source = RuntimeJsonStore.jreSource(configDir);
        if (source == null || source.isBlank()) {
            source = DesktopPreferencesStore.jreSourceOrNull();
        }
        if (source == null || source.isBlank() || "bundled-jlink".equalsIgnoreCase(source)) {
            source = "bundled";
        }
        source = source.trim().toLowerCase(Locale.ROOT);

        if ("custom".equals(source)) {
            String customHome = RuntimeJsonStore.jreCustomHome(configDir);
            if (customHome == null) {
                customHome = DesktopPreferencesStore.jreCustomHomeOrNull();
            }
            if (customHome != null && !customHome.isBlank()) {
                Path custom = Path.of(customHome.trim()).resolve("bin").resolve(javaName);
                if (Files.isRegularFile(custom)) {
                    return new JavaResolution(custom, "custom");
                }
            }
        }

        if ("system".equals(source)) {
            return new JavaResolution(detectSystemJava(javaName), "system");
        }

        Path[] candidates = new Path[]{
                install.resolve("runtime").resolve("bin").resolve(javaName),
                backendRoot.resolve("jre").resolve("bin").resolve(javaName),
        };
        for (Path candidate : candidates) {
            if (Files.isRegularFile(candidate)) {
                return new JavaResolution(candidate, "bundled");
            }
        }
        return new JavaResolution(detectSystemJava(javaName), "system");
    }

    private static Path detectSystemJava(String javaName) {
        String home = System.getenv("JAVA_HOME");
        if (home != null && !home.isBlank()) {
            Path candidate = Path.of(home.trim()).resolve("bin").resolve(javaName);
            if (Files.isRegularFile(candidate)) {
                return candidate;
            }
        }
        return Path.of(javaName);
    }

    private Path resolveServerJar() throws IOException {
        Path root = DesktopPaths.backendRoot(packaged);
        if (packaged) {
            Path jar = root.resolve("datawise-server.jar");
            return Files.isRegularFile(jar) ? jar : null;
        }
        if (!Files.isDirectory(root)) {
            return null;
        }
        try (Stream<Path> stream = Files.list(root)) {
            return stream
                    .filter(p -> {
                        String name = p.getFileName().toString();
                        return name.startsWith("datawise-server-")
                                && name.endsWith(".jar")
                                && !name.endsWith(".original");
                    })
                    .max(Comparator.comparing(p -> p.getFileName().toString()))
                    .orElse(null);
        }
    }

    private record HealthProbe(boolean ok, String configDir) {
    }

    private HealthProbe probeHealth(String baseUrl) {
        try {
            HttpURLConnection conn = (HttpURLConnection) URI.create(baseUrl + HEALTH_PATH).toURL().openConnection();
            conn.setConnectTimeout(3000);
            conn.setReadTimeout(3000);
            conn.setRequestMethod("GET");
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) {
                conn.disconnect();
                return new HealthProbe(false, null);
            }
            String configDir = null;
            try (InputStream in = conn.getInputStream();
                 InputStreamReader reader = new InputStreamReader(in, StandardCharsets.UTF_8)) {
                JsonObject root = JsonParser.parseReader(reader).getAsJsonObject();
                JsonObject data = root.has("data") && root.get("data").isJsonObject()
                        ? root.getAsJsonObject("data")
                        : root;
                if (data.has("configDir") && !data.get("configDir").isJsonNull()) {
                    JsonElement el = data.get("configDir");
                    if (el.isJsonPrimitive()) {
                        String value = el.getAsString().trim();
                        if (!value.isEmpty()) {
                            configDir = value;
                        }
                    }
                }
            } finally {
                conn.disconnect();
            }
            return new HealthProbe(true, configDir);
        } catch (Exception e) {
            return new HealthProbe(false, null);
        }
    }

    public static void appendLog(Path configDir, String message) {
        if (message == null || message.isBlank()) {
            return;
        }
        try {
            Path logDir = configDir.resolve("logs");
            Files.createDirectories(logDir);
            Path logFile = logDir.resolve("datawise.log");
            String line = java.time.Instant.now() + " [desktop] " + message.replace('\n', ' ') + System.lineSeparator();
            Files.writeString(logFile, line, java.nio.charset.StandardCharsets.UTF_8,
                    java.nio.file.StandardOpenOption.CREATE, java.nio.file.StandardOpenOption.APPEND);
        } catch (Exception ignored) {
        }
    }

    public Path runtimeLogPath() {
        Path dir = runtimeConfigDir.isBlank() ? resolveRuntimeConfigDir() : Path.of(runtimeConfigDir);
        return resolvePreferredRuntimeLog(dir.resolve("logs"));
    }

    /**
     * Prefer the active rolling file {@code datawise.log}; if missing, newest {@code *.log}
     * in the logs directory (archives under {@code archive/} are ignored).
     */
    static Path resolvePreferredRuntimeLog(Path logsDir) {
        Path primary = logsDir.resolve("datawise.log");
        if (Files.isRegularFile(primary)) {
            return primary;
        }
        Path newest = null;
        long newestMtime = Long.MIN_VALUE;
        try {
            if (Files.isDirectory(logsDir)) {
                try (Stream<Path> stream = Files.list(logsDir)) {
                    for (Path path : stream.toList()) {
                        if (!Files.isRegularFile(path)) {
                            continue;
                        }
                        String name = path.getFileName().toString().toLowerCase(Locale.ROOT);
                        if (!name.endsWith(".log")) {
                            continue;
                        }
                        long mtime = Files.getLastModifiedTime(path).toMillis();
                        if (mtime >= newestMtime) {
                            newestMtime = mtime;
                            newest = path;
                        }
                    }
                }
            }
        } catch (Exception ignored) {
            // fall through to primary
        }
        return newest != null ? newest : primary;
    }
}
