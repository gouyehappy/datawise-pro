package org.apache.datawise.desktop.process;

import org.apache.datawise.desktop.DesktopPaths;
import org.apache.datawise.desktop.backend.BackendProcessService;

import java.io.File;
import java.lang.management.ManagementFactory;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * Relaunch the current JVM process (workspace switch / apply config).
 *
 * <p>Windows (packaged): release single-instance lock → {@link WindowsProcessRestarter}
 * (WMI / Task Scheduler out-of-job watcher that waits for parent PID; breakaway as fallback)
 * → {@code System.exit}.
 * Starting the app while this JVM still holds the lock makes the child exit as a duplicate.
 */
public final class ProcessRelauncher {
    private ProcessRelauncher() {
    }

    public static void relaunch(BackendProcessService backend) {
        relaunch(backend, null);
    }

    /**
     * @param releaseSingleInstance close the single-instance lock <em>before</em> scheduling restart
     */
    public static void relaunch(BackendProcessService backend, AutoCloseable releaseSingleInstance) {
        List<String> command = List.of();
        try {
            try {
                if (backend != null) {
                    backend.stop();
                }
            } catch (Exception ex) {
                logRelaunch("backend.stop failed: " + ex.getMessage());
            }

            if (releaseSingleInstance != null) {
                try {
                    releaseSingleInstance.close();
                    logRelaunch("single-instance lock released");
                } catch (Exception ex) {
                    logRelaunch("single-instance release failed: " + ex.getMessage());
                }
            }
            forceClearLockFile();

            command = resolveCommand();
            File workDir = resolveWorkDir(command);
            long parentPid = ProcessHandle.current().pid();
            logRelaunch("schedule restart parentPid=" + parentPid
                    + " workDir=" + (workDir != null ? workDir.getAbsolutePath() : "")
                    + " cmd=" + String.join(" ", command));

            if (WindowsProcessRestarter.isSupported()) {
                Path cwd = workDir != null ? workDir.toPath() : Path.of(System.getProperty("user.dir"));
                List<String> launchCmd = WindowsProcessRestarter.preferPackagedExe(cwd, command);
                WindowsProcessRestarter.ScheduleResult scheduled =
                        WindowsProcessRestarter.scheduleAfterPidExits(parentPid, cwd, launchCmd);
                logRelaunch("watcher pid=" + scheduled.watcherPid()
                        + " method=" + scheduled.method()
                        + " waiting for parentPid=" + parentPid);
            } else {
                ProcessBuilder pb = new ProcessBuilder(command);
                if (workDir != null) {
                    pb.directory(workDir);
                }
                pb.redirectInput(ProcessBuilder.Redirect.INHERIT);
                pb.redirectOutput(ProcessBuilder.Redirect.DISCARD);
                pb.redirectError(ProcessBuilder.Redirect.DISCARD);
                Process child = pb.start();
                logRelaunch("spawned pid=" + child.pid());
            }
            logRelaunch("parent exiting; watcher will start app after this pid exits");
        } catch (Exception e) {
            logRelaunch("FAILED: " + e.getClass().getSimpleName() + ": " + e.getMessage()
                    + " attempted=" + String.join(" ", command));
            System.err.println("[datawise-desktop] relaunch failed: " + e.getMessage());
            System.err.println("[datawise-desktop] attempted: " + String.join(" ", command));
        }
        System.exit(0);
    }

    private static void forceClearLockFile() {
        try {
            Path lock = DesktopPaths.singleInstanceLockFile();
            Files.deleteIfExists(lock);
            logRelaunch("deleted lock file " + lock);
        } catch (Exception ex) {
            logRelaunch("lock file delete skipped: " + ex.getMessage());
        }
    }

    static List<String> resolveCommand() {
        List<String> launcher = resolvePackagedLauncherCommand();
        if (launcher != null) {
            logRelaunch("using packaged launcher: " + launcher);
            return launcher;
        }

        Optional<String> cmd = ProcessHandle.current().info().command();
        Optional<String[]> args = ProcessHandle.current().info().arguments();
        if (cmd.isPresent()) {
            List<String> full = new ArrayList<>();
            full.add(cmd.get());
            args.ifPresent(a -> full.addAll(Arrays.asList(a)));
            if (full.size() > 1) {
                logRelaunch("using ProcessHandle command+args (" + full.size() + " tokens)");
                return full;
            }
            String name = new File(cmd.get()).getName().toLowerCase(Locale.ROOT);
            if (!isJavaBinaryName(name)) {
                logRelaunch("using ProcessHandle bare executable: " + cmd.get());
                return full;
            }
        }

        List<String> reconstructed = reconstructJavaCommand();
        if (reconstructed != null) {
            logRelaunch("using reconstructed java command (" + reconstructed.size() + " tokens)");
            return reconstructed;
        }

        logRelaunch("using classpath fallback");
        return fallbackClasspathCommand();
    }

    private static List<String> resolvePackagedLauncherCommand() {
        boolean win = isWindows();
        try {
            Path install = DesktopPaths.installRoot().toAbsolutePath().normalize();
            if (win) {
                Path exe = install.resolve("DataWiseCLI.exe");
                if (Files.isRegularFile(exe)) {
                    return List.of(exe.toString());
                }
                Path cmdFile = install.resolve("DataWiseCLI.cmd");
                if (Files.isRegularFile(cmdFile)) {
                    return List.of(cmdFile.toString());
                }
            }
            Path launcher = DesktopPaths.resolveWindowsLauncher();
            if (launcher != null && Files.isRegularFile(launcher)) {
                String name = launcher.getFileName().toString().toLowerCase(Locale.ROOT);
                if (name.endsWith(".exe") || name.endsWith(".cmd") || name.endsWith(".bat")) {
                    return List.of(launcher.toAbsolutePath().normalize().toString());
                }
            }
            logRelaunch("packaged launcher not found under installRoot=" + install);
        } catch (Exception ex) {
            logRelaunch("resolvePackagedLauncher failed: " + ex.getMessage());
        }
        return null;
    }

    private static List<String> reconstructJavaCommand() {
        Optional<String> cmd = ProcessHandle.current().info().command();
        String java = cmd.filter(path -> isJavaBinaryName(new File(path).getName()))
                .orElseGet(() -> {
                    String javaHome = System.getProperty("java.home");
                    boolean win = isWindows();
                    return javaHome + File.separator + "bin" + File.separator + (win ? "java.exe" : "java");
                });

        String sunCommand = System.getProperty("sun.java.command");
        if (sunCommand == null || sunCommand.isBlank()) {
            return null;
        }

        List<String> full = new ArrayList<>();
        full.add(java);
        for (String jvmArg : ManagementFactory.getRuntimeMXBean().getInputArguments()) {
            if (jvmArg != null && !jvmArg.isBlank()) {
                full.add(jvmArg);
            }
        }
        ensureJvmFlag(full, "-Ddatawise.gui=", "true");
        ensureJvmFlag(full, "-Djava.awt.headless=", "false");
        if (Boolean.parseBoolean(System.getProperty("datawise.packaged", "false"))) {
            ensureJvmFlag(full, "-Ddatawise.packaged=", "true");
        }
        String installRoot = System.getProperty("datawise.install.root");
        if (installRoot != null && !installRoot.isBlank() && !installRoot.contains("$")) {
            ensureJvmFlag(full, "-Ddatawise.install.root=", installRoot);
        }

        for (String part : sunCommand.trim().split("\\s+")) {
            if (!part.isBlank()) {
                full.add(part);
            }
        }
        return full.size() > 1 ? full : null;
    }

    private static List<String> fallbackClasspathCommand() {
        String javaHome = System.getProperty("java.home");
        boolean win = isWindows();
        String java = javaHome + File.separator + "bin" + File.separator + (win ? "java.exe" : "java");
        List<String> fallback = new ArrayList<>();
        fallback.add(java);
        fallback.add("-Ddatawise.gui=true");
        fallback.add("-Djava.awt.headless=false");
        if (Boolean.parseBoolean(System.getProperty("datawise.packaged", "false"))) {
            fallback.add("-Ddatawise.packaged=true");
        }
        String installRoot = System.getProperty("datawise.install.root");
        if (installRoot != null && !installRoot.isBlank() && !installRoot.contains("$")) {
            fallback.add("-Ddatawise.install.root=" + installRoot);
        }
        fallback.add("-cp");
        fallback.add(System.getProperty("java.class.path"));
        String main = System.getProperty(
                "datawise.relaunch.main",
                "org.apache.datawise.backend.DatawiseBackendApplication");
        fallback.add(main);
        return fallback;
    }

    private static void ensureJvmFlag(List<String> args, String prefix, String value) {
        for (String arg : args) {
            if (arg != null && arg.startsWith(prefix)) {
                return;
            }
        }
        args.add(prefix + value);
    }

    private static boolean isJavaBinaryName(String name) {
        String n = name.toLowerCase(Locale.ROOT);
        return "java".equals(n) || "java.exe".equals(n) || "javaw".equals(n) || "javaw.exe".equals(n);
    }

    private static boolean isWindows() {
        return System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
    }

    private static File resolveWorkDir(List<String> command) {
        try {
            String coded = System.getProperty("datawise.install.root");
            if (coded != null && !coded.isBlank() && !coded.contains("$")) {
                Path p = Path.of(coded.trim());
                if (Files.isDirectory(p)) {
                    return p.toAbsolutePath().normalize().toFile();
                }
            }
            Path install = DesktopPaths.installRoot();
            if (Files.isDirectory(install) && Files.isRegularFile(install.resolve("DataWiseCLI.exe"))) {
                return install.toAbsolutePath().normalize().toFile();
            }
        } catch (Exception ignored) {
        }

        if (command == null || command.isEmpty()) {
            return new File(System.getProperty("user.dir"));
        }
        try {
            Path exe = Path.of(command.get(0)).toAbsolutePath().normalize();
            Path parent = exe.getParent();
            if (parent != null && Files.isDirectory(parent)) {
                if ("bin".equalsIgnoreCase(String.valueOf(parent.getFileName()))) {
                    Path runtime = parent.getParent();
                    if (runtime != null && "runtime".equalsIgnoreCase(String.valueOf(runtime.getFileName()))) {
                        Path root = runtime.getParent();
                        if (root != null && Files.isDirectory(root)) {
                            return root.toFile();
                        }
                    }
                }
                return parent.toFile();
            }
        } catch (Exception ignored) {
        }
        return new File(System.getProperty("user.dir"));
    }

    private static void logRelaunch(String message) {
        String line = Instant.now() + " " + message + System.lineSeparator();
        System.err.println("[datawise-desktop] relaunch: " + message);
        try {
            Path dir = DesktopPaths.userDataDir();
            Files.createDirectories(dir);
            Files.writeString(
                    dir.resolve("relaunch.log"),
                    line,
                    StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE,
                    StandardOpenOption.WRITE,
                    StandardOpenOption.APPEND
            );
        } catch (Exception ignored) {
        }
    }
}
