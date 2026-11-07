package org.apache.datawise.desktop;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Resolve install / user-data / resource paths for the JCEF desktop host.
 */
public final class DesktopPaths {
    private static final String APP_DIR_NAME = "DataWiseCLI";

    private DesktopPaths() {
    }

    public static Path userDataDir() {
        String override = System.getenv("DATAWISE_USER_DATA");
        if (override != null && !override.isBlank()) {
            return Paths.get(override.trim());
        }
        Path portable = portableDataRoot();
        if (portable != null) {
            return portable.resolve("user-data");
        }
        String os = System.getProperty("os.name", "").toLowerCase();
        if (os.contains("win")) {
            String appData = System.getenv("APPDATA");
            if (appData != null && !appData.isBlank()) {
                return Paths.get(appData, APP_DIR_NAME);
            }
        }
        if (os.contains("mac")) {
            return Paths.get(System.getProperty("user.home"), "Library", "Application Support", APP_DIR_NAME);
        }
        String xdg = System.getenv("XDG_CONFIG_HOME");
        if (xdg != null && !xdg.isBlank()) {
            return Paths.get(xdg, APP_DIR_NAME);
        }
        return Paths.get(System.getProperty("user.home"), ".config", APP_DIR_NAME);
    }

    /**
     * Machine-scoped data (last-write-wins chrome / theme). Prefer shared dirs;
     * fall back to {@link #userDataDir()} when not writable (e.g. locked-down macOS).
     */
    public static Path machineDataDir() {
        String override = System.getenv("DATAWISE_MACHINE_DATA");
        if (override != null && !override.isBlank()) {
            return Paths.get(override.trim());
        }
        Path portable = portableDataRoot();
        if (portable != null) {
            return portable.resolve("machine-data");
        }
        String os = System.getProperty("os.name", "").toLowerCase();
        Path candidate;
        if (os.contains("win")) {
            String programData = System.getenv("ProgramData");
            if (programData == null || programData.isBlank()) {
                programData = System.getenv("PROGRAMDATA");
            }
            candidate = (programData != null && !programData.isBlank())
                    ? Paths.get(programData, APP_DIR_NAME)
                    : userDataDir();
        } else if (os.contains("mac")) {
            candidate = Paths.get("/Library/Application Support", APP_DIR_NAME);
        } else {
            candidate = Paths.get("/var/lib", APP_DIR_NAME.toLowerCase());
        }
        if (isWritableDir(candidate)) {
            return candidate;
        }
        return userDataDir();
    }

    /**
     * Optional portable layout: only when {@code PORTABLE_EXECUTABLE_DIR} points at a real
     * DataWiseCLI install root (contains {@code DataWiseCLI.exe}). Ignore otherwise so a
     * foreign portable shell cannot redirect user/machine data beside its own exe.
     */
    public static Path portableDataRoot() {
        String portable = System.getenv("PORTABLE_EXECUTABLE_DIR");
        if (portable == null || portable.isBlank()) {
            return null;
        }
        Path dir;
        try {
            dir = Paths.get(portable.trim()).toAbsolutePath().normalize();
        } catch (Exception e) {
            return null;
        }
        if (Files.isRegularFile(dir.resolve("DataWiseCLI.exe"))
                || Files.isRegularFile(dir.resolve("DataWiseCLI.cmd"))) {
            return dir;
        }
        return null;
    }

    private static boolean isWritableDir(Path dir) {
        try {
            Files.createDirectories(dir);
            Path probe = dir.resolve(".write-probe");
            Files.writeString(probe, "ok");
            Files.deleteIfExists(probe);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public static Path documentsWorkspacesParent() {
        return Paths.get(System.getProperty("user.home"), "Documents", "DataWise", "workspaces");
    }

    /** Install root: directory containing host jar / resources (backend, frontend-dist). */
    public static Path installRoot() {
        String override = System.getenv("DATAWISE_INSTALL_ROOT");
        if (override != null && !override.isBlank()) {
            return Paths.get(override.trim());
        }
        String coded = System.getProperty("datawise.install.root");
        if (coded != null && !coded.isBlank()) {
            return Paths.get(coded.trim());
        }
        Path fromCode = installRootFromCodeSource();
        if (fromCode != null && (looksLikePackagedInstall(fromCode) || looksLikeRepoRoot(fromCode))) {
            return fromCode;
        }
        Path fromCwd = findRepoRoot(Paths.get("").toAbsolutePath());
        if (fromCwd != null) {
            return fromCwd;
        }
        if (fromCode != null) {
            return fromCode;
        }
        return Paths.get("").toAbsolutePath();
    }

    private static Path installRootFromCodeSource() {
        try {
            Path codeSource = Paths.get(
                    DesktopPaths.class.getProtectionDomain().getCodeSource().getLocation().toURI());
            Path parent = codeSource.getParent();
            if (parent == null) {
                return null;
            }
            // jpackage app-image: <root>/app/*.jar
            if ("app".equalsIgnoreCase(String.valueOf(parent.getFileName()))) {
                Path root = parent.getParent();
                if (root != null) {
                    return root;
                }
            }
            if (looksLikePackagedInstall(parent)) {
                return parent;
            }
            Path moduleRoot = parent.getParent();
            if (moduleRoot != null
                    && "datawise-desktop".equals(String.valueOf(moduleRoot.getFileName()))) {
                Path repo = moduleRoot.getParent();
                if (repo != null && looksLikeRepoRoot(repo)) {
                    return repo;
                }
            }
            return parent;
        } catch (Exception ignored) {
            return null;
        }
    }

    private static boolean looksLikeRepoRoot(Path dir) {
        return Files.isDirectory(dir.resolve("datawise-frontend"))
                && Files.isDirectory(dir.resolve("datawise-desktop"))
                && Files.isDirectory(dir.resolve("datawise-backend"));
    }

    private static boolean looksLikePackagedInstall(Path dir) {
        return Files.isRegularFile(dir.resolve("DataWiseCLI.exe"))
                || Files.isDirectory(dir.resolve("backend"))
                || Files.isDirectory(dir.resolve("frontend-dist"))
                || Files.isDirectory(dir.resolve("resources").resolve("backend"))
                || Files.isDirectory(dir.resolve("config-bundle"))
                || Files.isDirectory(dir.resolve("resources").resolve("config-bundle"));
    }

    private static Path findRepoRoot(Path start) {
        Path walk = start == null ? null : start.toAbsolutePath().normalize();
        for (int i = 0; i < 8 && walk != null; i++) {
            if (looksLikeRepoRoot(walk)) {
                return walk;
            }
            walk = walk.getParent();
        }
        return null;
    }

    /** Preferred Windows launcher (.exe), else .cmd, else jar. */
    public static Path resolveWindowsLauncher() {
        Path install = installRoot();
        Path exe = install.resolve("DataWiseCLI.exe");
        if (Files.isRegularFile(exe)) {
            return exe;
        }
        Path cmd = install.resolve("DataWiseCLI.cmd");
        if (Files.isRegularFile(cmd)) {
            return cmd;
        }
        try {
            return Paths.get(
                    DesktopPaths.class.getProtectionDomain().getCodeSource().getLocation().toURI());
        } catch (Exception e) {
            return install.resolve("datawise-desktop.jar");
        }
    }

    public static Path backendRoot(boolean packaged) {
        Path install = installRoot();
        if (packaged) {
            Path nested = install.resolve("resources").resolve("backend");
            if (Files.isDirectory(nested)) {
                return nested;
            }
            return install.resolve("backend");
        }
        return install.resolve("datawise-backend").resolve("datawise-server").resolve("target");
    }

    public static Path configBundleRoot(boolean packaged) {
        Path install = installRoot();
        if (packaged) {
            Path nested = install.resolve("resources").resolve("config-bundle");
            if (Files.isDirectory(nested)) {
                return nested;
            }
            Path flat = install.resolve("config-bundle");
            if (Files.isDirectory(flat)) {
                return flat;
            }
            return nested;
        }
        Path bundled = install.resolve("datawise-frontend").resolve("resources").resolve("bundle-config");
        if (Files.isDirectory(bundled)) {
            return bundled;
        }
        Path repo = findRepoRoot(Paths.get("").toAbsolutePath());
        if (repo != null) {
            Path fromRepo = repo.resolve("datawise-frontend").resolve("resources").resolve("bundle-config");
            if (Files.isDirectory(fromRepo)) {
                return fromRepo;
            }
        }
        return bundled;
    }

    public static Path frontendDistRoot() {
        Path install = installRoot();
        Path packaged = install.resolve("resources").resolve("frontend-dist");
        if (Files.isRegularFile(packaged.resolve("index.html"))) {
            return packaged;
        }
        Path sibling = install.resolve("frontend-dist");
        if (Files.isRegularFile(sibling.resolve("index.html"))) {
            return sibling;
        }
        return install.resolve("datawise-frontend").resolve("dist");
    }

    public static Path singleInstanceLockFile() {
        return userDataDir().resolve("single-instance.lock");
    }
}
