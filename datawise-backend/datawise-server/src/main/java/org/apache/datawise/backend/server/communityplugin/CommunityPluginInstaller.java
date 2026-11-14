package org.apache.datawise.backend.server.communityplugin;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginActivation;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginCompatibilityGate;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginException;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginInstallPolicy;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginInstallResult;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginManifest;
import org.apache.datawise.backend.domain.communityplugin.DwpCodec;
import org.apache.datawise.backend.domain.communityplugin.InstalledCommunityPlugin;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;

/**
 * Installs / rolls back / uninstalls {@code .dwp} packages under {@code config/community-plugins/}.
 */
@Service
public class CommunityPluginInstaller {

    private static final Logger log = LoggerFactory.getLogger(CommunityPluginInstaller.class);
    static final String VERSIONS_DIR = "versions";
    static final String ACTIVATIONS_DIR = "activations";

    private final ConfigDirectoryService configDirectory;
    private final ObjectMapper objectMapper;
    private final String appVersion;
    private final CommunityPluginTrustStore trustStore;
    /** Null in unit tests that do not exercise live sidecar stop. */
    private final CommunityPluginPackageReplaceBarrier packageReplaceBarrier;

    /**
     * Spring constructor. The package-private overload exists only for tests;
     * with two constructors, this one must be marked {@code @Autowired}.
     */
    @Autowired
    public CommunityPluginInstaller(
            ConfigDirectoryService configDirectory,
            ObjectMapper objectMapper,
            CommunityPluginTrustStore trustStore,
            CommunityPluginPackageReplaceBarrier packageReplaceBarrier
    ) {
        this(
                configDirectory,
                objectMapper,
                System.getProperty("datawise.version", "4.1.0"),
                trustStore,
                packageReplaceBarrier
        );
    }

    /** Test helper — not a Spring bean constructor. */
    CommunityPluginInstaller(ConfigDirectoryService configDirectory, ObjectMapper objectMapper, String appVersion) {
        this(configDirectory, objectMapper, appVersion, null, null);
    }

    CommunityPluginInstaller(
            ConfigDirectoryService configDirectory,
            ObjectMapper objectMapper,
            String appVersion,
            CommunityPluginTrustStore trustStore
    ) {
        this(configDirectory, objectMapper, appVersion, trustStore, null);
    }

    CommunityPluginInstaller(
            ConfigDirectoryService configDirectory,
            ObjectMapper objectMapper,
            String appVersion,
            CommunityPluginTrustStore trustStore,
            CommunityPluginPackageReplaceBarrier packageReplaceBarrier
    ) {
        this.configDirectory = configDirectory;
        this.objectMapper = objectMapper;
        this.appVersion = appVersion != null ? appVersion : "4.1.0";
        this.trustStore = trustStore;
        this.packageReplaceBarrier = packageReplaceBarrier;
    }

    public Path rootDir() {
        return configDirectory.resolve(ConfigPaths.COMMUNITY_PLUGINS_DIR);
    }

    public CommunityPluginInstallResult installBytes(byte[] packageBytes, CommunityPluginInstallPolicy policy) {
        try (StoreLock ignored = lockStore()) {
            return installBytesLocked(packageBytes, policy);
        }
    }

    public CommunityPluginInstallResult installFile(Path packagePath, CommunityPluginInstallPolicy policy) {
        try {
            if (packagePath == null || !Files.isRegularFile(packagePath)) {
                throw new CommunityPluginException("Plugin package file not found");
            }
            String name = packagePath.getFileName().toString().toLowerCase();
            if (!name.endsWith("." + DwpCodec.EXTENSION)) {
                throw new CommunityPluginException("Plugin package must use the ." + DwpCodec.EXTENSION + " extension");
            }
            return installBytes(DwpCodec.readAll(packagePath), policy);
        } catch (IOException e) {
            throw new CommunityPluginException("Failed to read plugin package: " + e.getMessage(), e);
        }
    }

    public void uninstall(String pluginId) {
        DwpCodec.validatePluginId(pluginId);
        try (StoreLock ignored = lockStore()) {
            Path pluginDir = rootDir().resolve(pluginId);
            if (!Files.exists(pluginDir)) {
                return;
            }
            beginPackageReplaceQuietly(pluginId);
            try {
                deleteRecursive(pluginDir);
            } finally {
                endPackageReplaceQuietly(pluginId);
            }
        }
    }

    public CommunityPluginInstallResult rollback(String pluginId) {
        DwpCodec.validatePluginId(pluginId);
        try (StoreLock ignored = lockStore()) {
            Path container = rootDir().resolve(pluginId);
            CommunityPluginActivation current = readLatestActivation(container)
                    .orElseThrow(() -> new CommunityPluginException("Plugin '" + pluginId + "' does not have an active version"));
            if (current.previousVersion() == null || current.previousVersion().isBlank()) {
                throw new CommunityPluginException("Plugin '" + pluginId + "' does not have a rollback version");
            }
            Path versionDir = container.resolve(VERSIONS_DIR).resolve(current.previousVersion());
            InstalledCommunityPlugin plugin = loadInstalled(pluginId, versionDir);
            if (!plugin.compatibility().compatible()) {
                throw new CommunityPluginException(
                        "Rollback version " + current.previousVersion() + " is incompatible: "
                                + String.join("; ", plugin.compatibility().errors()));
            }
            CommunityPluginActivation next = new CommunityPluginActivation(
                    current.sequence() + 1,
                    current.previousVersion(),
                    current.version(),
                    current.packageSha256(),
                    Instant.now().toString()
            );
            try {
                writeActivation(container, next);
            } catch (IOException e) {
                throw new CommunityPluginException("Failed to write rollback activation: " + e.getMessage(), e);
            }
            return new CommunityPluginInstallResult(plugin, current.version(), next.packageSha256(), true);
        }
    }

    public List<InstalledCommunityPlugin> listInstalled() {
        Path root = rootDir();
        if (!Files.isDirectory(root)) {
            return List.of();
        }
        List<InstalledCommunityPlugin> out = new ArrayList<>();
        try (Stream<Path> stream = Files.list(root)) {
            stream.filter(Files::isDirectory)
                    .filter(p -> !p.getFileName().toString().startsWith("."))
                    .sorted(Comparator.comparing(p -> p.getFileName().toString()))
                    .forEach(container -> {
                        try {
                            resolveActiveDir(container).ifPresent(active -> {
                                try {
                                    out.add(loadInstalled(container.getFileName().toString(), active));
                                } catch (Exception e) {
                                    log.warn("Skip broken community plugin at {}: {}", container, e.getMessage());
                                }
                            });
                        } catch (Exception e) {
                            log.warn("Skip community plugin container {}: {}", container, e.getMessage());
                        }
                    });
        } catch (IOException e) {
            throw new CommunityPluginException("Failed to list community plugins: " + e.getMessage(), e);
        }
        return out;
    }

    public Optional<InstalledCommunityPlugin> findInstalled(String pluginId) {
        DwpCodec.validatePluginId(pluginId);
        Path container = rootDir().resolve(pluginId);
        return resolveActiveDir(container).map(active -> loadInstalled(pluginId, active));
    }

    private CommunityPluginInstallResult installBytesLocked(byte[] packageBytes, CommunityPluginInstallPolicy policy) {
        try {
            Files.createDirectories(rootDir());
            DwpCodec.VerifiedPackage verified = DwpCodec.verify(
                    packageBytes,
                    policy,
                    objectMapper,
                    trustStore != null ? trustStore.publicKeyIndex() : Map.of()
            );
            CommunityPluginManifest manifest = verified.manifest();
            Path staging = Files.createTempDirectory(rootDir(), ".dwp-staging-");
            try {
                Path packageDir = staging.resolve("package");
                Files.createDirectories(packageDir);
                DwpCodec.extractTo(verified, packageDir);

                Path compatibilityPath = packageDir;
                InstalledCommunityPlugin.CommunityPluginCompatibility compatibility =
                        evaluateCompatibility(manifest, compatibilityPath);
                if (!compatibility.compatible()) {
                    throw new CommunityPluginException(
                            "Plugin '" + manifest.id() + "' is incompatible: " + String.join("; ", compatibility.errors()));
                }

                Path container = rootDir().resolve(manifest.id());
                Path versionsDir = container.resolve(VERSIONS_DIR);
                Path activationsDir = container.resolve(ACTIVATIONS_DIR);
                Files.createDirectories(versionsDir);
                Files.createDirectories(activationsDir);

                Path versionDir = versionsDir.resolve(manifest.version());
                Optional<CommunityPluginActivation> current = readLatestActivation(container);
                if (policy != CommunityPluginInstallPolicy.DEVELOPMENT
                        && Files.isDirectory(versionDir)
                        && current.isPresent()
                        && manifest.version().equals(current.get().version())) {
                    throw new CommunityPluginException(
                            "Plugin '" + manifest.id() + "' version " + manifest.version() + " is already installed");
                }

                String previousVersion = current
                        .map(a -> manifest.version().equals(a.version()) ? a.previousVersion() : a.version())
                        .filter(v -> v != null && !v.isBlank() && !v.equals(manifest.version()))
                        .orElse(null);

                // Windows locks the sidecar .exe while the process is alive.
                // Stop + block re-activate so an open workbench cannot respawn
                // the process and re-lock the directory mid-swap.
                beginPackageReplaceQuietly(manifest.id());
                try {
                    // Swap atomically: move the old version aside first so a failed
                    // move never leaves the store without the active version dir.
                    Path previous = null;
                    if (Files.exists(versionDir)) {
                        previous = staging.resolve("previous");
                        moveWithRetry(versionDir, previous);
                    }
                    try {
                        moveWithRetry(packageDir, versionDir);
                    } catch (IOException moveFailure) {
                        if (previous != null) {
                            try {
                                moveWithRetry(previous, versionDir);
                            } catch (IOException restoreFailure) {
                                moveFailure.addSuppressed(restoreFailure);
                            }
                        }
                        throw moveFailure;
                    }

                    CommunityPluginActivation activation = new CommunityPluginActivation(
                            current.map(a -> a.sequence() + 1).orElse(1L),
                            manifest.version(),
                            previousVersion,
                            verified.packageSha256(),
                            Instant.now().toString()
                    );
                    writeActivation(container, activation);

                    InstalledCommunityPlugin installed = new InstalledCommunityPlugin(manifest, versionDir, compatibility);
                    return new CommunityPluginInstallResult(
                            installed, previousVersion, verified.packageSha256(), verified.signed());
                } finally {
                    endPackageReplaceQuietly(manifest.id());
                }
            } finally {
                deleteRecursive(staging);
            }
        } catch (CommunityPluginException e) {
            throw e;
        } catch (IOException e) {
            throw new CommunityPluginException("Failed to install plugin package: " + e.getMessage(), e);
        }
    }

    private InstalledCommunityPlugin loadInstalled(String pluginId, Path activeDir) {
        try {
            Path manifestPath = activeDir.resolve(DwpCodec.MANIFEST_ENTRY);
            CommunityPluginManifest manifest = objectMapper.readValue(manifestPath.toFile(), CommunityPluginManifest.class);
            if (!pluginId.equals(manifest.id())) {
                throw new CommunityPluginException("Manifest id mismatch under " + activeDir);
            }
            return new InstalledCommunityPlugin(manifest, activeDir, evaluateCompatibility(manifest, activeDir));
        } catch (IOException e) {
            throw new CommunityPluginException("Failed to read plugin manifest: " + e.getMessage(), e);
        }
    }

    private InstalledCommunityPlugin.CommunityPluginCompatibility evaluateCompatibility(
            CommunityPluginManifest manifest,
            Path pluginDir
    ) {
        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        CommunityPluginCompatibilityGate.collectErrors(
                manifest,
                appVersion,
                CommunityPluginCompatibilityGate.HOST_API,
                errors,
                warnings
        );
        if (manifest.entrypoints() != null && manifest.entrypoints().backend() != null) {
            String executable = manifest.entrypoints().backend().executable();
            if (executable != null && !executable.isBlank()) {
                Path exe = pluginDir.resolve(executable).normalize();
                if (!exe.startsWith(pluginDir)) {
                    errors.add("backend executable escapes plugin directory");
                } else if (!Files.isRegularFile(exe)) {
                    // Allow missing binary in early scaffolding / cross-platform fixtures.
                    warnings.add("backend executable not found for current package layout: " + executable);
                }
            }
        }
        boolean ok = errors.isEmpty();
        return new InstalledCommunityPlugin.CommunityPluginCompatibility(ok, errors, warnings, DwpCodec.currentTarget());
    }

    Optional<Path> resolveActiveDir(Path container) {
        if (!Files.isDirectory(container)) {
            return Optional.empty();
        }
        return readLatestActivation(container).flatMap(activation -> {
            Path versionDir = container.resolve(VERSIONS_DIR).resolve(activation.version());
            if (!Files.isDirectory(versionDir) || !Files.isRegularFile(versionDir.resolve(DwpCodec.MANIFEST_ENTRY))) {
                return Optional.empty();
            }
            return Optional.of(versionDir);
        });
    }

    private Optional<CommunityPluginActivation> readLatestActivation(Path container) {
        Path activations = container.resolve(ACTIVATIONS_DIR);
        if (!Files.isDirectory(activations)) {
            return Optional.empty();
        }
        try (Stream<Path> stream = Files.list(activations)) {
            return stream
                    .filter(p -> p.getFileName().toString().endsWith(".json"))
                    .map(p -> {
                        try {
                            return objectMapper.readValue(p.toFile(), CommunityPluginActivation.class);
                        } catch (IOException e) {
                            throw new CommunityPluginException("Invalid activation " + p + ": " + e.getMessage(), e);
                        }
                    })
                    .max(Comparator.comparingLong(CommunityPluginActivation::sequence));
        } catch (IOException e) {
            throw new CommunityPluginException("Failed to read activations: " + e.getMessage(), e);
        }
    }

    private void writeActivation(Path container, CommunityPluginActivation activation) throws IOException {
        Path dir = container.resolve(ACTIVATIONS_DIR);
        Files.createDirectories(dir);
        Path file = dir.resolve(activation.sequence() + ".json");
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(file.toFile(), activation);
    }

    private StoreLock lockStore() {
        try {
            Path root = rootDir();
            Files.createDirectories(root);
            Path lockPath = configDirectory.resolve(ConfigPaths.COMMUNITY_PLUGIN_INSTALL_LOCK);
            Files.createDirectories(lockPath.getParent());
            RandomAccessFile raf = new RandomAccessFile(lockPath.toFile(), "rw");
            FileChannel channel = raf.getChannel();
            FileLock lock = channel.lock();
            return new StoreLock(raf, channel, lock);
        } catch (IOException e) {
            throw new CommunityPluginException("Failed to lock community plugin store: " + e.getMessage(), e);
        }
    }

    private void beginPackageReplaceQuietly(String pluginId) {
        if (packageReplaceBarrier == null || pluginId == null || pluginId.isBlank()) {
            return;
        }
        try {
            packageReplaceBarrier.begin(pluginId);
        } catch (RuntimeException e) {
            log.warn("Failed to stop community plugin '{}' before install: {}", pluginId, e.getMessage());
        }
    }

    private void endPackageReplaceQuietly(String pluginId) {
        if (packageReplaceBarrier == null || pluginId == null || pluginId.isBlank()) {
            return;
        }
        try {
            packageReplaceBarrier.end(pluginId);
        } catch (RuntimeException e) {
            log.warn("Failed to clear install barrier for community plugin '{}': {}", pluginId, e.getMessage());
        }
    }

    private static void deleteRecursive(Path path) {
        if (path == null || !Files.exists(path)) {
            return;
        }
        try (Stream<Path> walk = Files.walk(path)) {
            List<Path> entries = walk.sorted(Comparator.reverseOrder()).toList();
            for (Path p : entries) {
                deleteWithRetry(p);
            }
        } catch (IOException e) {
            throw new CommunityPluginException("Failed to delete " + path + ": " + e.getMessage(), e);
        }
    }

    /** Windows may briefly keep the sidecar exe locked after process.destroy(). */
    private static void deleteWithRetry(Path path) {
        IOException last = null;
        for (int attempt = 0; attempt < 12; attempt++) {
            try {
                Files.deleteIfExists(path);
                return;
            } catch (IOException e) {
                last = e;
                sleepBackoff(attempt);
            }
        }
        throw new CommunityPluginException(
                "Failed to delete " + path + ": " + (last != null ? last.getMessage() : "unknown"),
                last
        );
    }

    /**
     * Same Windows lock window as {@link #deleteWithRetry}: renaming a version
     * directory that still holds a mapped {@code .exe} fails until the sidecar
     * process fully exits.
     */
    private static void moveWithRetry(Path source, Path target) throws IOException {
        IOException last = null;
        for (int attempt = 0; attempt < 12; attempt++) {
            try {
                Files.move(source, target);
                return;
            } catch (IOException e) {
                last = e;
                sleepBackoff(attempt);
            }
        }
        throw last != null ? last : new IOException("Failed to move " + source + " -> " + target);
    }

    private static void sleepBackoff(int attempt) {
        try {
            Thread.sleep(100L * (attempt + 1));
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            throw new CommunityPluginException("Interrupted while waiting for plugin files to unlock", ie);
        }
    }

    private record StoreLock(RandomAccessFile raf, FileChannel channel, FileLock lock) implements AutoCloseable {
        @Override
        public void close() {
            try {
                lock.release();
            } catch (IOException ignored) {
            }
            try {
                channel.close();
            } catch (IOException ignored) {
            }
            try {
                raf.close();
            } catch (IOException ignored) {
            }
        }
    }
}
