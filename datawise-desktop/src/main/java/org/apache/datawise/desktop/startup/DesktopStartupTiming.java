package org.apache.datawise.desktop.startup;

import org.apache.datawise.desktop.DesktopPaths;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Host-side cold-start marks (local only — no remote telemetry).
 *
 * <p>Writes {@code logs/startup-timing.json} under the workspace config dir when
 * {@link #shellReady()} / {@link #flush()} runs. Safe to call from any thread;
 * each phase is recorded once.
 */
public final class DesktopStartupTiming {
    private static final long T0_NANOS = System.nanoTime();
    private static final long T0_EPOCH_MS = System.currentTimeMillis();
    private static final Map<String, Long> MARKS_MS = new ConcurrentHashMap<>();
    private static final AtomicBoolean FLUSHED = new AtomicBoolean(false);
    private static volatile String configDir = "";
    private static volatile boolean firstLaunchSeed;

    private DesktopStartupTiming() {
    }

    /** Process / GUI entry — call as early as practical in {@code prepareAndStart}. */
    public static void markProcessStart() {
        mark("process-start");
    }

    public static void markConfigReady(Path resolvedConfigDir, boolean seededFromTemplate) {
        if (resolvedConfigDir != null) {
            configDir = resolvedConfigDir.toAbsolutePath().normalize().toString();
        }
        firstLaunchSeed = seededFromTemplate;
        mark("config-ready");
    }

    public static void markCefReady() {
        mark("cef-ready");
    }

    public static void markWindowShown() {
        mark("window-shown");
    }

    public static void markSpringReady() {
        mark("spring-ready");
    }

    public static void markHealthReady() {
        mark("health-ready");
    }

    public static void markShellReady() {
        mark("shell-ready");
        flush();
    }

    public static void mark(String phase) {
        if (phase == null || phase.isBlank()) {
            return;
        }
        MARKS_MS.putIfAbsent(phase.trim(), elapsedMs());
    }

    public static long elapsedMs() {
        return (System.nanoTime() - T0_NANOS) / 1_000_000L;
    }

    public static Map<String, Long> snapshot() {
        return Map.copyOf(MARKS_MS);
    }

    /** Force write even if shell-ready was never reached (e.g. failure path). */
    public static void flush() {
        if (!FLUSHED.compareAndSet(false, true)) {
            return;
        }
        try {
            Path dir = resolveLogDir();
            if (dir == null) {
                return;
            }
            Files.createDirectories(dir);
            Path out = dir.resolve("startup-timing.json");
            Files.writeString(out, toJson(), StandardCharsets.UTF_8);
            System.out.println("[datawise-desktop] startup timing → " + out.toAbsolutePath()
                    + " shellReadyMs=" + MARKS_MS.getOrDefault("shell-ready", -1L));
        } catch (Exception e) {
            System.err.println("[datawise-desktop] startup timing write skipped: " + e.getMessage());
        }
    }

    private static Path resolveLogDir() {
        try {
            if (configDir != null && !configDir.isBlank()) {
                return Path.of(configDir).resolve("logs");
            }
            String prop = System.getProperty("datawise.logging.dir");
            if (prop != null && !prop.isBlank()) {
                return Path.of(prop.trim());
            }
            return DesktopPaths.userDataDir().resolve("logs");
        } catch (Exception e) {
            return null;
        }
    }

    private static String toJson() {
        Map<String, Long> ordered = new LinkedHashMap<>();
        for (String key : new String[]{
                "process-start",
                "config-ready",
                "cef-ready",
                "window-shown",
                "spring-ready",
                "health-ready",
                "shell-ready",
        }) {
            Long v = MARKS_MS.get(key);
            if (v != null) {
                ordered.put(key, v);
            }
        }
        for (Map.Entry<String, Long> e : MARKS_MS.entrySet()) {
            ordered.putIfAbsent(e.getKey(), e.getValue());
        }

        StringBuilder sb = new StringBuilder(256);
        sb.append("{\n");
        sb.append("  \"t0EpochMs\": ").append(T0_EPOCH_MS).append(",\n");
        sb.append("  \"firstLaunchSeed\": ").append(firstLaunchSeed).append(",\n");
        sb.append("  \"configDir\": ").append(jsonString(configDir)).append(",\n");
        sb.append("  \"marksMs\": {\n");
        boolean first = true;
        for (Map.Entry<String, Long> e : ordered.entrySet()) {
            if (!first) {
                sb.append(",\n");
            }
            first = false;
            sb.append("    ").append(jsonString(e.getKey())).append(": ").append(e.getValue());
        }
        sb.append("\n  }\n");
        sb.append("}\n");
        return sb.toString();
    }

    private static String jsonString(String value) {
        if (value == null) {
            return "\"\"";
        }
        String escaped = value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\r", "\\r")
                .replace("\n", "\\n");
        return "\"" + escaped + "\"";
    }

    /** Test hook — not used in production. */
    static void resetForTests() {
        MARKS_MS.clear();
        FLUSHED.set(false);
        configDir = "";
        firstLaunchSeed = false;
        mark("process-start");
    }

    static boolean isFlushedForTests() {
        return FLUSHED.get();
    }

    static String jsonForTests() {
        return toJson().toLowerCase(Locale.ROOT);
    }
}
