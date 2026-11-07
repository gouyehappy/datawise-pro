package org.apache.datawise.backend.connector.plugin;

import org.apache.datawise.backend.connector.ConnectorPluginContributionHolder;
import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.spi.ConnectorDialectContributions;
import org.apache.datawise.backend.connector.spi.ConnectorPluginContext;
import org.apache.datawise.backend.connector.spi.DataSourceConnectorProvider;
import org.apache.datawise.backend.connector.spi.SqlExecutionHook;
import org.apache.datawise.backend.domain.ConnectorPluginLoadFailure;
import org.apache.datawise.backend.domain.ConnectorPluginManifest;
import org.apache.datawise.backend.domain.ConnectorPluginManifestEntry;
import org.apache.datawise.backend.common.support.ConfigDirectoryLocator;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import jakarta.annotation.PreDestroy;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.ServiceConfigurationError;
import java.util.ServiceLoader;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Loads optional datasource connector plugins from {@code {configDir}/plugins/*.jar}.
 * <p>
 * JARs are copied into {@code plugins/.runtime/} before opening a {@link URLClassLoader},
 * so the source file under {@code plugins/} is not locked on Windows and can be uninstalled
 * without restarting the process.
 */
@Component
public class ConnectorPluginLoader {

    private static final Logger log = LoggerFactory.getLogger(ConnectorPluginLoader.class);
    private static final String NO_SPI_PROVIDERS = "NO_SPI_PROVIDERS";
    private static final String RUNTIME_DIR_NAME = ".runtime";
    private static final String QUARANTINE_DIR_NAME = ".quarantine";
    private static final String QUARANTINE_REASON_SUFFIX = ".reason";
    private static final String PENDING_DELETE_SUFFIX = ".pending-delete";
    private static final int DELETE_ATTEMPTS = 8;
    private static final long DELETE_RETRY_MS = 40L;

    private final Path pluginsDir;
    private final boolean loadPlugins;
    private final boolean requireManifestIntegrity;
    private final ClassLoader applicationClassLoader;
    /**
     * Concurrent: plugin bootstrap/reload mutates while UI polls
     * {@code /api/datasources/plugins/status} (see {@link #loadedJarByConnectorId()}).
     */
    private final List<LoadedPlugin> loadedPlugins = new CopyOnWriteArrayList<>();
    private final List<SqlExecutionHook> loadedSqlExecutionHooks = new CopyOnWriteArrayList<>();
    private final List<ConnectorPluginLoadFailure> failedPlugins = new CopyOnWriteArrayList<>();
    private volatile ConnectorPluginManifest cachedManifest;

    /** Programmatic / test construction (plugins enabled). */
    public ConnectorPluginLoader(String configDir, String pluginsDirName) throws IOException {
        this(configDir, pluginsDirName, true, false);
    }

    @Autowired
    public ConnectorPluginLoader(
                                 @Value("${datawise.config.dir:config}") String configDir,
                                 @Value("${datawise.connectors.plugins-dir:plugins}") String pluginsDirName,
                                 @Value("${datawise.connectors.load-plugins:true}") boolean loadPlugins,
                                 @Value("${datawise.connectors.require-manifest-integrity:true}") boolean requireManifestIntegrity) throws IOException {
        Path configRoot = ConfigDirectoryLocator.resolve(configDir);
        String dirName = pluginsDirName != null && !pluginsDirName.isBlank() ? pluginsDirName.trim() : "plugins";
        this.pluginsDir = configRoot.resolve(dirName).toAbsolutePath().normalize();
        this.loadPlugins = loadPlugins;
        this.requireManifestIntegrity = requireManifestIntegrity;
        this.applicationClassLoader = ConnectorPluginLoader.class.getClassLoader();
        Files.createDirectories(pluginsDir);
        log.info(
                "Connector plugins directory: {} (loadPlugins={}, requireManifestIntegrity={})",
                pluginsDir,
                loadPlugins,
                requireManifestIntegrity);
    }

    public Path pluginsDirectory() {
        return pluginsDir;
    }

    public Optional<ConnectorPluginManifest> manifest() {
        ConnectorPluginManifest current = cachedManifest;
        if (current != null) {
            return Optional.of(current);
        }
        Optional<ConnectorPluginManifest> loaded = ConnectorPluginManifestSupport.readManifest(pluginsDir);
        loaded.ifPresent(value -> cachedManifest = value);
        return loaded;
    }

    /** Reloads {@code manifest.json} from disk (marketplace refresh). */
    public Optional<ConnectorPluginManifest> reloadManifest() {
        cachedManifest = null;
        return manifest();
    }

    /** Maps connector id → JAR file name for plugins loaded from disk. */
    public Map<String, String> loadedJarByConnectorId() {
        // Snapshot iteration: CopyOnWriteArrayList iterators never throw CME
        // when loadJar() registers plugins on another thread.
        Map<String, String> map = new LinkedHashMap<>();
        for (LoadedPlugin plugin : loadedPlugins) {
            String jarName = plugin.jarPath().getFileName().toString();
            for (String connectorId : plugin.connectorIds()) {
                map.putIfAbsent(connectorId, jarName);
            }
        }
        return Map.copyOf(map);
    }

    public List<String> loadedPluginJarNames() {
        return loadedPlugins.stream()
                .map(plugin -> plugin.jarPath().getFileName().toString())
                .sorted()
                .toList();
    }

    public List<ConnectorPluginLoadFailure> failedPluginLoads() {
        return List.copyOf(failedPlugins);
    }

    public List<SqlExecutionHook> loadedSqlExecutionHooks() {
        return List.copyOf(loadedSqlExecutionHooks);
    }

    public List<DataSourceConnector> loadConnectors(
                                                    ConnectorPluginContext context,
                                                    ConnectorPluginContributionHolder contributionHolder) {
        closeLoadedPlugins();
        failedPlugins.clear();
        loadedSqlExecutionHooks.clear();
        cachedManifest = null;
        purgePendingDeletes();
        reportQuarantinedJars();
        List<DataSourceConnector> connectors = new ArrayList<>();
        ConnectorDialectContributions contributions = ConnectorDialectContributions.EMPTY;
        if (!loadPlugins) {
            contributionHolder.setContributions(ConnectorDialectContributions.EMPTY);
            log.info("Connector plugin loading disabled (datawise.connectors.load-plugins=false)");
            return connectors;
        }
        Optional<ConnectorPluginManifest> manifest = manifest();
        for (Path jarPath : listPluginJars()) {
            contributions = loadJar(jarPath, context, connectors, contributions, manifest);
        }
        contributionHolder.setContributions(contributions);
        if (!connectors.isEmpty()) {
            List<String> ids = connectors.stream()
                    .map(DataSourceConnector::id)
                    .distinct()
                    .sorted()
                    .toList();
            log.info("Loaded {} connector plugin(s) from {}: {}", ids.size(), pluginsDir, ids);
        }
        if (!failedPlugins.isEmpty()) {
            log.warn("Connector plugin load failures: {}", failedPlugins);
        }
        return connectors;
    }

    @PreDestroy
    public void closeAll() {
        closeLoadedPlugins();
    }

    /** Closes plugin classloaders without re-scanning the plugins directory. */
    public synchronized void unloadAll() {
        closeLoadedPlugins();
        failedPlugins.clear();
        loadedSqlExecutionHooks.clear();
        cachedManifest = null;
    }

    /**
     * Deletes a plugin JAR under {@code plugins/}, with retries and a Windows-friendly
     * rename-to-{@code .pending-delete} fallback when the file is still locked.
     *
     * @return {@code true} if the file is gone or successfully marked pending-delete
     */
    public boolean deletePluginJar(Path jarPath) throws IOException {
        if (jarPath == null || !Files.isRegularFile(jarPath)) {
            return false;
        }
        Path runtimeCopy = runtimeDir().resolve(jarPath.getFileName().toString());
        tryDeleteWithRetries(runtimeCopy);
        if (tryDeleteWithRetries(jarPath)) {
            return true;
        }
        Path pending = jarPath.resolveSibling(jarPath.getFileName().toString() + PENDING_DELETE_SUFFIX);
        try {
            Files.move(jarPath, pending, StandardCopyOption.REPLACE_EXISTING);
            log.warn("Plugin JAR locked; renamed for delete on next load: {}", pending.getFileName());
            return true;
        } catch (IOException renameEx) {
            throw new IOException(
                    "Failed to delete plugin JAR (file lock?): " + jarPath
                            + " — " + renameEx.getMessage(),
                    renameEx);
        }
    }

    private ConnectorDialectContributions loadJar(
                                                  Path jarPath,
                                                  ConnectorPluginContext context,
                                                  List<DataSourceConnector> connectors,
                                                  ConnectorDialectContributions accumulated,
                                                  Optional<ConnectorPluginManifest> manifest) {
        String jarName = jarPath.getFileName().toString();
        if (!verifyJarIntegrity(jarPath, jarName, manifest)) {
            return accumulated;
        }
        URLClassLoader pluginClassLoader = null;
        Path runtimeJar = null;
        try {
            runtimeJar = materializeRuntimeCopy(jarPath);
            pluginClassLoader = openPluginClassLoader(runtimeJar);
            ServiceLoader<DataSourceConnectorProvider> providers = ServiceLoader.load(
                    DataSourceConnectorProvider.class,
                    pluginClassLoader);
            // 整 JAR 事务式加载：先收集到局部，全部成功后再对外发布，
            // 避免部分 provider 失败时注册表持有背后 classloader 已关闭的实例
            List<DataSourceConnector> jarConnectors = new ArrayList<>();
            List<SqlExecutionHook> jarHooks = new ArrayList<>();
            ConnectorDialectContributions jarContributions = ConnectorDialectContributions.EMPTY;
            for (DataSourceConnectorProvider provider : providers) {
                // ServiceLoader can surface parent-classpath providers; only accept ones whose
                // META-INF/services entry (or defining CL) belongs to this plugin JAR.
                if (!isContributedByPluginJar(
                        DataSourceConnectorProvider.class, provider, pluginClassLoader)) {
                    log.debug(
                            "Skipping classpath SPI provider {} while loading {}",
                            provider.getClass().getName(),
                            jarName);
                    continue;
                }
                DataSourceConnector connector = provider.create(context);
                String connectorId = connector.id();
                boolean duplicateInJar = jarConnectors.stream().anyMatch(existing -> existing.id().equals(connectorId));
                boolean alreadyLoaded = connectors.stream().anyMatch(existing -> existing.id().equals(connectorId));
                if (duplicateInJar || alreadyLoaded) {
                    log.debug("Skipping duplicate connector id {} from {}", connectorId, jarName);
                    continue;
                }
                jarConnectors.add(connector);
                jarContributions = jarContributions.merge(provider.dialectContributions());
            }
            for (SqlExecutionHook hook : ServiceLoader.load(SqlExecutionHook.class, pluginClassLoader)) {
                if (!isContributedByPluginJar(SqlExecutionHook.class, hook, pluginClassLoader)) {
                    continue;
                }
                jarHooks.add(hook);
            }
            if (jarConnectors.isEmpty()) {
                log.warn("Connector plugin jar has no SPI providers: {}", jarName);
                recordFailure(jarName, NO_SPI_PROVIDERS);
                closeQuietly(pluginClassLoader);
                tryDeleteQuietly(runtimeJar);
                return accumulated;
            }
            List<String> connectorIds = jarConnectors.stream().map(DataSourceConnector::id).toList();
            connectors.addAll(jarConnectors);
            loadedSqlExecutionHooks.addAll(jarHooks);
            loadedPlugins.add(new LoadedPlugin(jarPath, runtimeJar, pluginClassLoader, connectorIds));
            jarConnectors.forEach(connector -> log.info("Registered connector plugin {} from {}", connector.id(), jarName));
            jarHooks.forEach(hook -> log.info("Registered SQL execution hook {} from {}", hook.id(), jarName));
            return accumulated.merge(jarContributions);
        } catch (Exception | LinkageError | ServiceConfigurationError ex) {
            // ServiceLoader 对缺类插件抛 Error（如 NoClassDefFoundError）；单个坏插件不得阻断启动
            closeQuietly(pluginClassLoader);
            tryDeleteQuietly(runtimeJar);
            ExceptionLogging.warn(log, "Failed to load connector plugin " + jarName, ex);
            recordFailure(jarName, summarizeLoadFailure(ex));
            return accumulated;
        }
    }

    private boolean verifyJarIntegrity(
                                       Path jarPath,
                                       String jarName,
                                       Optional<ConnectorPluginManifest> manifest) {
        if (manifest.isEmpty()) {
            if (requireManifestIntegrity) {
                log.error("Rejecting connector plugin {} — plugin manifest.json is missing", jarName);
                rejectAndQuarantine(jarPath, jarName, "MANIFEST_MISSING");
                return false;
            }
            return true;
        }
        Optional<ConnectorPluginManifestEntry> entry = ConnectorPluginManifestSupport.findByJar(manifest.get(), jarName);
        if (entry.isEmpty()) {
            if (requireManifestIntegrity) {
                log.error("Rejecting connector plugin {} — not listed in manifest.json", jarName);
                rejectAndQuarantine(jarPath, jarName, "MANIFEST_ENTRY_MISSING");
                return false;
            }
            return true;
        }
        String expectedSha = entry.get().sha256();
        if (expectedSha == null || expectedSha.isBlank()) {
            if (requireManifestIntegrity) {
                log.error("Rejecting connector plugin {} — manifest entry has no sha256", jarName);
                rejectAndQuarantine(jarPath, jarName, "MANIFEST_SHA_MISSING");
                return false;
            }
            return true;
        }
        try {
            if (ConnectorPluginManifestSupport.matchesSha256(jarPath, expectedSha)) {
                log.info("Connector plugin {} SHA-256 verified against manifest", jarName);
                return true;
            }
            String reason = "INTEGRITY_MISMATCH";
            if (requireManifestIntegrity) {
                log.error("Rejecting connector plugin {} due to SHA-256 mismatch with manifest", jarName);
                rejectAndQuarantine(jarPath, jarName, reason);
                return false;
            }
            log.warn("Connector plugin {} SHA-256 does not match manifest (continuing; set datawise.connectors.require-manifest-integrity=true to enforce)", jarName);
            return true;
        } catch (IOException ex) {
            ExceptionLogging.warn(log, "Failed to verify connector plugin integrity " + jarName, ex);
            if (requireManifestIntegrity) {
                rejectAndQuarantine(jarPath, jarName, "INTEGRITY_CHECK_FAILED");
                return false;
            }
            return true;
        }
    }

    private void rejectAndQuarantine(Path jarPath, String jarName, String reason) {
        recordFailure(jarName, reason);
        quarantineRejectedJar(jarPath, jarName, reason);
    }

    private void recordFailure(String jarName, String reason) {
        failedPlugins.add(new ConnectorPluginLoadFailure(jarName, reason));
    }

    private static String summarizeLoadFailure(Throwable ex) {
        if (ex == null) {
            return "UNKNOWN";
        }
        Throwable walk = ex;
        while (walk != null) {
            if (walk instanceof java.nio.file.FileSystemException) {
                return "RUNTIME_COPY_LOCKED";
            }
            walk = walk.getCause();
        }
        String message = ex.getMessage();
        if (message != null && !message.isBlank()) {
            String trimmed = message.trim();
            // Keep UI badges short; full detail stays in logs.
            if (trimmed.length() > 160) {
                return trimmed.substring(0, 157) + "...";
            }
            return trimmed;
        }
        return ex.getClass().getSimpleName();
    }

    /**
     * Moves integrity-rejected JARs out of the live plugins directory so one bad file
     * cannot keep failing every reload. Sidecar {@code *.reason} records the code.
     */
    private void quarantineRejectedJar(Path jarPath, String jarName, String reason) {
        if (jarPath == null || !Files.isRegularFile(jarPath)) {
            return;
        }
        try {
            Path quarantineDir = pluginsDir.resolve(QUARANTINE_DIR_NAME);
            Files.createDirectories(quarantineDir);
            Path dest = quarantineDir.resolve(jarName);
            if (Files.exists(dest)) {
                String stamp = String.valueOf(System.currentTimeMillis());
                dest = quarantineDir.resolve(jarName + "." + stamp + ".jar");
            }
            Files.move(jarPath, dest, StandardCopyOption.REPLACE_EXISTING);
            Path reasonFile = quarantineDir.resolve(dest.getFileName() + QUARANTINE_REASON_SUFFIX);
            Files.writeString(reasonFile, reason != null ? reason : "UNKNOWN", StandardCharsets.UTF_8);
            log.warn("Quarantined connector plugin {} → {} ({})", jarName, dest.getFileName(), reason);
        } catch (IOException ex) {
            ExceptionLogging.warn(log, "Failed to quarantine connector plugin " + jarName, ex);
        }
    }

    /** Surfaces previously quarantined JARs so UI/ops can act without re-scanning them as live plugins. */
    private void reportQuarantinedJars() {
        Path quarantineDir = pluginsDir.resolve(QUARANTINE_DIR_NAME);
        if (!Files.isDirectory(quarantineDir)) {
            return;
        }
        try (var stream = Files.list(quarantineDir)) {
            stream.filter(Files::isRegularFile)
                    .filter(path -> path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".jar"))
                    .sorted()
                    .forEach(path -> {
                        String jarName = path.getFileName().toString();
                        String reason = readQuarantineReason(quarantineDir, jarName);
                        recordFailure(jarName, "QUARANTINED:" + reason);
                    });
        } catch (IOException ex) {
            ExceptionLogging.warn(log, "Failed to list quarantined connector plugins in " + quarantineDir, ex);
        }
    }

    private static String readQuarantineReason(Path quarantineDir, String jarName) {
        Path reasonFile = quarantineDir.resolve(jarName + QUARANTINE_REASON_SUFFIX);
        if (!Files.isRegularFile(reasonFile)) {
            return "UNKNOWN";
        }
        try {
            String text = Files.readString(reasonFile, StandardCharsets.UTF_8).trim();
            return text.isEmpty() ? "UNKNOWN" : text;
        } catch (IOException ex) {
            return "UNKNOWN";
        }
    }

    /**
     * Deletes quarantined plugin JARs (and reason sidecars). Returns how many JARs were removed.
     */
    public int clearQuarantine() throws IOException {
        Path quarantineDir = pluginsDir.resolve(QUARANTINE_DIR_NAME);
        if (!Files.isDirectory(quarantineDir)) {
            return 0;
        }
        int deleted = 0;
        try (var stream = Files.list(quarantineDir)) {
            for (Path path : stream.toList()) {
                if (!Files.isRegularFile(path)) {
                    continue;
                }
                String name = path.getFileName().toString();
                if (name.toLowerCase(Locale.ROOT).endsWith(".jar")
                        || name.endsWith(QUARANTINE_REASON_SUFFIX)) {
                    if (tryDeleteWithRetries(path)) {
                        if (name.toLowerCase(Locale.ROOT).endsWith(".jar")) {
                            deleted += 1;
                        }
                    }
                }
            }
        }
        return deleted;
    }

    private List<Path> listPluginJars() {
        if (!Files.isDirectory(pluginsDir)) {
            return List.of();
        }
        try (var stream = Files.list(pluginsDir)) {
            return stream.filter(Files::isRegularFile)
                    .filter(path -> path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".jar"))
                    .sorted()
                    .toList();
        } catch (IOException ex) {
            ExceptionLogging.warn(log, "Failed to list connector plugins in " + pluginsDir, ex);
            return List.of();
        }
    }

    private Path runtimeDir() throws IOException {
        Path dir = pluginsDir.resolve(RUNTIME_DIR_NAME);
        Files.createDirectories(dir);
        return dir;
    }

    /**
     * Copy {@code sourceJar} into {@code plugins/.runtime/} for classloading.
     * <p>
     * On Windows a previous {@link URLClassLoader} may still hold the destination file after
     * {@link #closeLoadedPlugins()}; {@code REPLACE_EXISTING} then fails with
     * {@link java.nio.file.FileSystemException}. Prefer delete-with-retry, and fall back to a
     * unique sibling name so reload/install can proceed without restarting the JVM.
     */
    private Path materializeRuntimeCopy(Path sourceJar) throws IOException {
        Path runtime = runtimeDir();
        String jarName = sourceJar.getFileName().toString();
        Path dest = runtime.resolve(jarName);
        if (Files.isRegularFile(dest)) {
            if (sameFileContent(sourceJar, dest)) {
                return dest;
            }
            if (!tryDeleteWithRetries(dest)) {
                dest = runtime.resolve(uniqueRuntimeJarName(jarName));
            }
        }
        Path temp = runtime.resolve(jarName + ".copy-" + System.nanoTime() + ".tmp");
        try {
            Files.copy(sourceJar, temp);
            try {
                Files.move(temp, dest, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (IOException atomicFailed) {
                try {
                    Files.move(temp, dest, StandardCopyOption.REPLACE_EXISTING);
                } catch (IOException replaceFailed) {
                    // Destination still locked — keep the temp file under a unique final name.
                    Path fallback = runtime.resolve(uniqueRuntimeJarName(jarName));
                    Files.move(temp, fallback, StandardCopyOption.REPLACE_EXISTING);
                    log.warn(
                            "Runtime plugin copy locked ({}); using {} instead",
                            dest.getFileName(),
                            fallback.getFileName());
                    return fallback;
                }
            }
            return dest;
        } catch (IOException ex) {
            try {
                Files.deleteIfExists(temp);
            } catch (IOException ignored) {
                // best-effort
            }
            throw ex;
        }
    }

    private static String uniqueRuntimeJarName(String jarName) {
        String base = jarName;
        String suffix = "";
        String lower = jarName.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".jar")) {
            base = jarName.substring(0, jarName.length() - 4);
            suffix = ".jar";
        }
        return base + "." + System.nanoTime() + suffix;
    }

    private static boolean sameFileContent(Path left, Path right) {
        try {
            if (Files.size(left) != Files.size(right)) {
                return false;
            }
            return ConnectorPluginManifestSupport.matchesSha256(
                    left, ConnectorPluginManifestSupport.sha256Hex(right));
        } catch (IOException ex) {
            return false;
        }
    }

    private URLClassLoader openPluginClassLoader(Path runtimeJar) throws IOException {
        return new URLClassLoader(new URL[]{runtimeJar.toUri().toURL()}, applicationClassLoader);
    }

    private void purgePendingDeletes() {
        if (!Files.isDirectory(pluginsDir)) {
            return;
        }
        try (var stream = Files.list(pluginsDir)) {
            stream.filter(Files::isRegularFile)
                    .filter(path -> path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(PENDING_DELETE_SUFFIX))
                    .forEach(this::tryDeleteQuietly);
        } catch (IOException ex) {
            ExceptionLogging.warn(log, "Failed to purge pending plugin deletes in " + pluginsDir, ex);
        }
        Path runtime = pluginsDir.resolve(RUNTIME_DIR_NAME);
        if (!Files.isDirectory(runtime)) {
            return;
        }
        try (var stream = Files.list(runtime)) {
            stream.filter(Files::isRegularFile).forEach(this::tryDeleteQuietly);
        } catch (IOException ex) {
            ExceptionLogging.warn(log, "Failed to purge runtime plugin copies in " + runtime, ex);
        }
    }

    private void closeLoadedPlugins() {
        for (LoadedPlugin plugin : loadedPlugins) {
            closeQuietly(plugin.classLoader());
            tryDeleteQuietly(plugin.runtimeJarPath());
        }
        loadedPlugins.clear();
        loadedSqlExecutionHooks.clear();
        // Hint the JVM to release native jar handles sooner on Windows.
        System.gc();
    }

    private static boolean tryDeleteWithRetries(Path path) {
        if (path == null || !Files.exists(path)) {
            return true;
        }
        for (int attempt = 1; attempt <= DELETE_ATTEMPTS; attempt++) {
            try {
                Files.deleteIfExists(path);
                if (!Files.exists(path)) {
                    return true;
                }
            } catch (IOException ignored) {
                // retry
            }
            try {
                Thread.sleep(DELETE_RETRY_MS * attempt);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        return !Files.exists(path);
    }

    private void tryDeleteQuietly(Path path) {
        if (path == null) {
            return;
        }
        try {
            tryDeleteWithRetries(path);
        } catch (RuntimeException ignored) {
            // best-effort
        }
    }

    private static void closeQuietly(URLClassLoader classLoader) {
        if (classLoader == null) {
            return;
        }
        try {
            classLoader.close();
        } catch (IOException ex) {
            ExceptionLogging.recoverable(log, "Failed to close connector plugin classloader", ex);
        }
    }

    /**
     * Whether this SPI instance is contributed by {@code pluginClassLoader}'s own JAR.
     * <p>
     * Parent-first {@link URLClassLoader} may resolve the implementation class from the app
     * classpath (e.g. {@code datawise-connector-ssh} on the server) even when
     * {@code META-INF/services/…} lives only in the plugin JAR. Matching the service resource
     * URL to this JAR (not only {@code getClassLoader()}) avoids false negatives that drop SSH.
     */
    static boolean isContributedByPluginJar(
                                            Class<?> serviceType,
                                            Object spiInstance,
                                            URLClassLoader pluginClassLoader) {
        if (serviceType == null || spiInstance == null || pluginClassLoader == null) {
            return false;
        }
        if (spiInstance.getClass().getClassLoader() == pluginClassLoader) {
            return true;
        }
        URL[] urls = pluginClassLoader.getURLs();
        if (urls.length == 0) {
            return false;
        }
        String pluginJar = urls[0].toExternalForm();
        String resourceName = "META-INF/services/" + serviceType.getName();
        String providerName = spiInstance.getClass().getName();
        try {
            Enumeration<URL> resources = pluginClassLoader.getResources(resourceName);
            while (resources.hasMoreElements()) {
                URL resource = resources.nextElement();
                String resourceUrl = resource.toExternalForm();
                if (!resourceUrl.startsWith("jar:" + pluginJar + "!")) {
                    continue;
                }
                if (serviceFileListsProvider(resource, providerName)) {
                    return true;
                }
            }
        } catch (IOException ignored) {
            return false;
        }
        return false;
    }

    private static boolean serviceFileListsProvider(URL serviceResource, String providerClassName) throws IOException {
        try (
                InputStream in = serviceResource.openStream();
                BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                String trimmed = line.trim();
                if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                    continue;
                }
                if (trimmed.equals(providerClassName)) {
                    return true;
                }
            }
        }
        return false;
    }

    private record LoadedPlugin(
            Path jarPath,
            Path runtimeJarPath,
            URLClassLoader classLoader,
            List<String> connectorIds) {
    }
}
