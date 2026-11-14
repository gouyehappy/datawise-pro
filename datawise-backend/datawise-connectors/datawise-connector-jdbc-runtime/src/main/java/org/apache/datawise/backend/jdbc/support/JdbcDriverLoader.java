package org.apache.datawise.backend.jdbc.support;

import org.apache.datawise.backend.common.support.ConfigDirectoryLocator;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.config.JdbcDriverMavenProperties;
import org.apache.datawise.backend.jdbc.connection.JdbcDriverCoordinateSupport;
import org.apache.datawise.backend.jdbc.connection.JdbcDriverJarLocator;
import org.apache.datawise.backend.jdbc.connection.JdbcMavenCoordinate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.sql.Driver;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * Downloads JDBC driver JARs to {@code config/drivers/} and keeps loaded drivers in memory.
 * Maven 仓库列表见 {@link org.apache.datawise.backend.config.JdbcDriverMavenProperties}。
 */
@Component
public class JdbcDriverLoader {

    private static final Logger log = LoggerFactory.getLogger(JdbcDriverLoader.class);

    private final Path driversDir;
    private final JdbcDriverJarLocator jarLocator;
    private final List<String> mavenRepositories;
    private final ConcurrentMap<String, LoadedDriver> cache = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, DownloadProgress> downloads = new ConcurrentHashMap<>();

    @Autowired
    public JdbcDriverLoader(
            @Value("${datawise.config.dir:config}") String configDir,
            JdbcDriverMavenProperties mavenProperties
    ) throws IOException {
        this(configDir, mavenProperties != null ? mavenProperties.getRepositories() : null);
    }

    /** Tests / legacy: Maven Central only. */
    JdbcDriverLoader(String configDir) throws IOException {
        this(configDir, List.of(JdbcDriverMavenProperties.MAVEN_CENTRAL));
    }

    JdbcDriverLoader(String configDir, List<String> mavenRepositories) throws IOException {
        Path configRoot = ConfigDirectoryLocator.resolve(configDir);
        this.driversDir = configRoot.resolve("drivers").toAbsolutePath().normalize();
        Files.createDirectories(driversDir);
        this.jarLocator = new JdbcDriverJarLocator(driversDir);
        this.mavenRepositories = normalizeRepositories(mavenRepositories);
        log.info("JDBC drivers directory: {}; Maven repositories: {}", driversDir, this.mavenRepositories);
    }

    private static List<String> normalizeRepositories(List<String> repositories) {
        if (repositories == null || repositories.isEmpty()) {
            return List.of(JdbcDriverMavenProperties.MAVEN_CENTRAL);
        }
        List<String> normalized = new ArrayList<>();
        for (String entry : repositories) {
            if (entry == null || entry.isBlank()) {
                continue;
            }
            String trimmed = entry.trim().replaceAll("/+$", "");
            if (!trimmed.isEmpty() && !normalized.contains(trimmed)) {
                normalized.add(trimmed);
            }
        }
        return normalized.isEmpty() ? List.of(JdbcDriverMavenProperties.MAVEN_CENTRAL) : List.copyOf(normalized);
    }

    /**
     * Ensures driver class is loadable from local cache or Maven Central download.
     */
    public LoadedDriver ensureDriver(String mavenCoordinates, String driverClass) throws IOException, SQLException {
        JdbcMavenCoordinate coordinate = JdbcMavenCoordinate.parseFlexible(mavenCoordinates);
        String cacheKey = coordinate.cacheKey() + "|" + driverClass;
        LoadedDriver existing = cache.get(cacheKey);
        if (existing != null) {
            return existing;
        }
        if (HiveJdbcDriverBundle.isHiveDriver(driverClass) || HiveJdbcDriverBundle.isHiveMavenArtifact(coordinate)) {
            ensureHiveDriverBundle(coordinate.version());
            ThriftTransportLogLevels.applyQuietly();
        }
        Path jarPath = jarLocator.findLocalJar(coordinate, driverClass)
                .orElseGet(() -> resolveMissingJarPath(coordinate));
        boolean downloaded = false;
        if (!Files.isRegularFile(jarPath)) {
            if (HiveJdbcDriverBundle.isHiveMavenArtifact(coordinate)) {
                throw new IOException(HiveJdbcDriverBundle.installHint());
            }
            downloadJar(coordinate, jarPath);
            downloaded = true;
        }
        LoadedDriver loaded = loadDriver(jarPath, driverClass, downloaded, !downloaded);
        cache.put(cacheKey, loaded);
        return loaded;
    }

    /**
     * Loads driver from local JAR only; does not download from Maven Central.
     *
     * @return empty when jar is missing or already cached
     */
    public Optional<LoadedDriver> preloadIfPresent(String mavenCoordinates, String driverClass) {
        if (mavenCoordinates == null || mavenCoordinates.isBlank()
                || driverClass == null || driverClass.isBlank()) {
            return Optional.empty();
        }
        try {
            JdbcMavenCoordinate coordinate = JdbcMavenCoordinate.parseFlexible(mavenCoordinates.trim());
            String cacheKey = coordinate.cacheKey() + "|" + driverClass.trim();
            if (cache.containsKey(cacheKey)) {
                return Optional.empty();
            }
            Path jarPath = jarLocator.findLocalJar(coordinate, driverClass.trim()).orElse(null);
            if (jarPath == null || !Files.isRegularFile(jarPath)) {
                return Optional.empty();
            }
            LoadedDriver loaded = loadDriver(jarPath, driverClass.trim(), false, true);
            cache.put(cacheKey, loaded);
            return Optional.of(loaded);
        } catch (Throwable ex) {
            ExceptionLogging.warn(
                    log,
                    "Failed to preload JDBC driver " + mavenCoordinates + " " + driverClass,
                    ex
            );
            return Optional.empty();
        }
    }

    /**
     * Latest download snapshot for a Maven coordinate. Idle when nothing is downloading
     * and the JAR is not cached.
     */
    public DownloadProgress downloadProgress(String mavenCoordinates) {
        if (mavenCoordinates == null || mavenCoordinates.isBlank()) {
            return DownloadProgress.idle("");
        }
        try {
            JdbcMavenCoordinate coordinate = JdbcMavenCoordinate.parseFlexible(mavenCoordinates.trim());
            String key = coordinate.cacheKey();
            boolean cached = jarLocator.findLocalJar(coordinate, null).isPresent();
            DownloadProgress current = downloads.get(key);
            if (current == null) {
                return new DownloadProgress(key, 0, 0, false, cached, cached, null);
            }
            boolean completed = current.completed() || (cached && !current.active());
            return new DownloadProgress(
                    key,
                    current.downloadedBytes(),
                    current.totalBytes(),
                    current.active(),
                    completed,
                    cached,
                    current.error()
            );
        } catch (Exception ex) {
            return DownloadProgress.idle(mavenCoordinates.trim());
        }
    }

    /** Returns true when a matching or compatible JAR exists locally. */
    public boolean hasCachedJar(String mavenCoordinates) {
        try {
            JdbcMavenCoordinate coordinate = JdbcMavenCoordinate.parseFlexible(mavenCoordinates);
            return jarLocator.findLocalJar(coordinate, null).isPresent();
        } catch (Exception ex) {
            return false;
        }
    }

    /** Returns local JAR filename when present; empty when download would be required. */
    public Optional<String> resolveLocalJarFileName(String mavenCoordinates, String driverClass) {
        try {
            JdbcMavenCoordinate coordinate = JdbcMavenCoordinate.parseFlexible(mavenCoordinates);
            return jarLocator.findLocalJar(coordinate, driverClass)
                    .map(path -> path.getFileName().toString());
        } catch (Exception ex) {
            return Optional.empty();
        }
    }

    public Path driversDirectory() {
        return driversDir;
    }

    public List<String> listCachedJarNames() throws IOException {
        return jarLocator.listCachedJarNames();
    }

    /**
     * Lists JARs under {@code config/drivers/} (including one-level subdirs such as {@code hive/}).
     *
     * @return relative path from drivers dir (e.g. {@code mysql-….jar} or {@code hive/hive-….jar})
     */
    public List<CachedDriverJar> listCachedDriverJars() throws IOException {
        if (!Files.isDirectory(driversDir)) {
            return List.of();
        }
        List<CachedDriverJar> jars = new ArrayList<>();
        try (var stream = Files.walk(driversDir, 2)) {
            stream.filter(Files::isRegularFile)
                    .filter(path -> path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".jar"))
                    .sorted()
                    .forEach(path -> {
                        Path relative = driversDir.relativize(path);
                        String relativePath = relative.toString().replace('\\', '/');
                        boolean loaded = cache.values().stream()
                                .anyMatch(entry -> entry.jarPath().equals(path));
                        long size;
                        try {
                            size = Files.size(path);
                        } catch (IOException ex) {
                            size = 0L;
                        }
                        jars.add(new CachedDriverJar(
                                path.getFileName().toString(),
                                relativePath,
                                size,
                                loaded
                        ));
                    });
        }
        return List.copyOf(jars);
    }

    /**
     * Deletes a cached driver JAR. {@code relativePath} must be a plain file name or a single
     * subdirectory path under {@code config/drivers/} (e.g. {@code hive/x.jar}).
     */
    public boolean deleteCachedJar(String relativePath) throws IOException {
        if (relativePath == null || relativePath.isBlank()) {
            throw new IllegalArgumentException("relativePath is required");
        }
        String normalized = relativePath.trim().replace('\\', '/');
        if (normalized.contains("..") || normalized.startsWith("/") || normalized.startsWith("\\")) {
            throw new IllegalArgumentException("Invalid driver path: " + relativePath);
        }
        Path target = driversDir.resolve(normalized).normalize();
        if (!target.startsWith(driversDir.normalize())) {
            throw new IllegalArgumentException("Invalid driver path: " + relativePath);
        }
        if (!Files.isRegularFile(target)) {
            return false;
        }
        cache.entrySet().removeIf(entry -> {
            if (!entry.getValue().jarPath().equals(target)) {
                return false;
            }
            entry.getValue().closeQuietly();
            return true;
        });
        return Files.deleteIfExists(target);
    }

    /**
     * Deletes an entire driver bundle subdirectory under {@code config/drivers/} (e.g. {@code hive}).
     *
     * @return number of JAR files deleted
     */
    public int deleteCachedBundle(String bundleDirName) throws IOException {
        if (bundleDirName == null || bundleDirName.isBlank()) {
            throw new IllegalArgumentException("bundleDir is required");
        }
        String normalized = bundleDirName.trim().replace('\\', '/');
        if (normalized.contains("/") || normalized.contains("..") || normalized.contains("\\")) {
            throw new IllegalArgumentException("bundleDir must be a single directory name: " + bundleDirName);
        }
        Path bundleDir = driversDir.resolve(normalized).normalize();
        if (!bundleDir.startsWith(driversDir.normalize()) || !Files.isDirectory(bundleDir)) {
            return 0;
        }
        int deleted = 0;
        try (var stream = Files.list(bundleDir)) {
            for (Path path : stream.filter(Files::isRegularFile).toList()) {
                if (!path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".jar")) {
                    continue;
                }
                cache.entrySet().removeIf(entry -> entry.getValue().jarPath().equals(path));
                if (Files.deleteIfExists(path)) {
                    deleted++;
                }
            }
        }
        try (var remaining = Files.list(bundleDir)) {
            if (remaining.findAny().isEmpty()) {
                Files.deleteIfExists(bundleDir);
            }
        }
        return deleted;
    }

    public record CachedDriverJar(
            String fileName,
            String relativePath,
            long sizeBytes,
            boolean loadedInMemory
    ) {
    }

    public static boolean isMavenCoordinates(String value) {
        return JdbcDriverCoordinateSupport.isMavenCoordinates(value);
    }

    public static String normalizeDriverInput(String input) {
        return JdbcDriverCoordinateSupport.normalizeDriverInput(input);
    }

    private Path resolveMissingJarPath(JdbcMavenCoordinate coordinate) {
        if (HiveJdbcDriverBundle.isHiveDriverArtifact(coordinate)) {
            return jarLocator.hiveBundleDirectory().resolve(coordinate.fileName());
        }
        return driversDir.resolve(coordinate.fileName());
    }

    private void ensureHiveDriverBundle(String version) throws IOException {
        Path hiveDir = jarLocator.hiveBundleDirectory();
        Files.createDirectories(hiveDir);
        for (String coordinates : HiveJdbcDriverBundle.coordinatesForVersion(version)) {
            JdbcMavenCoordinate artifact = JdbcMavenCoordinate.parse(coordinates);
            Path target = hiveDir.resolve(artifact.fileName());
            if (!Files.isRegularFile(target)) {
                downloadJar(artifact, target);
            }
        }
    }

    private void downloadJar(JdbcMavenCoordinate coordinate, Path target) throws IOException {
        Files.createDirectories(target.getParent());
        Path temp = target.resolveSibling(target.getFileName() + ".download");
        String key = coordinate.cacheKey();
        markDownload(key, 0, -1, true, false, null);
        IOException lastFailure = null;
        List<String> attempted = new ArrayList<>();
        for (String repository : mavenRepositories) {
            URI uri = URI.create(repository + "/" + coordinate.repositoryPath());
            attempted.add(uri.toString());
            log.info("Downloading JDBC driver {} from {}", key, uri);
            HttpURLConnection connection = (HttpURLConnection) uri.toURL().openConnection();
            connection.setInstanceFollowRedirects(true);
            connection.setConnectTimeout(20_000);
            connection.setReadTimeout(180_000);
            connection.setRequestProperty("User-Agent", "DataWise-JDBC-DriverLoader");
            try {
                int status = connection.getResponseCode();
                if (status >= 400) {
                    throw new IOException("HTTP " + status + " from " + uri);
                }
                long total = connection.getContentLengthLong();
                long downloaded = 0;
                markDownload(key, 0, total, true, false, null);
                try (InputStream input = connection.getInputStream();
                     OutputStream output = Files.newOutputStream(temp)) {
                    byte[] buffer = new byte[16 * 1024];
                    int read;
                    while ((read = input.read(buffer)) >= 0) {
                        output.write(buffer, 0, read);
                        downloaded += read;
                        markDownload(key, downloaded, total, true, false, null);
                    }
                }
                try {
                    Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
                } catch (IOException atomic) {
                    Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
                }
                long size = total > 0 ? total : downloaded;
                markDownload(key, downloaded, size, false, true, null);
                return;
            } catch (IOException ex) {
                lastFailure = ex;
                ExceptionLogging.warn(log, "Failed to download JDBC driver from " + uri, ex);
                Files.deleteIfExists(temp);
                markDownload(key, 0, -1, true, false, ex.getMessage());
            } finally {
                connection.disconnect();
            }
        }
        String tried = String.join(", ", attempted);
        String message = "Failed to download JDBC driver " + key
                + " from configured Maven repositories. Tried: " + tried
                + ". Configure datawise.jdbc.maven.repositories or place the JAR under config/drivers/."
                + (lastFailure != null ? " Last error: " + lastFailure.getMessage() : "");
        markDownload(key, 0, -1, false, false, message);
        throw new IOException(message, lastFailure);
    }

    private void markDownload(
            String key,
            long downloadedBytes,
            long totalBytes,
            boolean active,
            boolean completed,
            String error
    ) {
        downloads.put(key, new DownloadProgress(key, downloadedBytes, totalBytes, active, completed, false, error));
    }

    private LoadedDriver loadDriver(Path jarPath, String driverClass, boolean downloaded, boolean cached)
            throws IOException, SQLException {
        URL[] jarUrls = buildDriverClasspath(jarPath, driverClass);
        ClassLoader parent = HiveJdbcDriverBundle.isHiveDriver(driverClass)
                ? ClassLoader.getPlatformClassLoader()
                : JdbcDriverLoader.class.getClassLoader();
        URLClassLoader classLoader = new URLClassLoader(jarUrls, parent);
        try {
            Class<?> clazz = Class.forName(driverClass, true, classLoader);
            Object instance = clazz.getDeclaredConstructor().newInstance();
            if (!(instance instanceof Driver driver)) {
                throw new SQLException("Class is not a JDBC Driver: " + driverClass);
            }
            if (downloaded) {
                log.info("Loaded JDBC driver {} from downloaded jar {}", driverClass, jarPath.getFileName());
            } else if (cached) {
                log.debug("Preloaded JDBC driver {} from {}", driverClass, jarPath.getFileName());
            }
            return new LoadedDriver(driver, jarPath, downloaded, cached, classLoader);
        } catch (ReflectiveOperationException ex) {
            if (HiveJdbcDriverBundle.isHiveDriver(driverClass)) {
                throw new SQLException(HiveJdbcDriverBundle.installHint(), ex);
            }
            throw new SQLException("Failed to load JDBC driver class: " + driverClass, ex);
        }
    }

    private URL[] buildDriverClasspath(Path primaryJar, String driverClass) throws IOException {
        Set<URL> urls = new LinkedHashSet<>();
        if (HiveJdbcDriverBundle.isHiveDriver(driverClass)) {
            appendJarDirectory(urls, jarLocator.hiveBundleDirectory());
            appendJarDirectory(urls, driversDir);
        }
        urls.add(primaryJar.toUri().toURL());
        return urls.toArray(URL[]::new);
    }

    private void appendJarDirectory(Set<URL> urls, Path directory) throws IOException {
        if (directory == null || !Files.isDirectory(directory)) {
            return;
        }
        List<Path> jars = new ArrayList<>();
        try (var stream = Files.list(directory)) {
            stream.filter(path -> Files.isRegularFile(path)
                            && path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".jar"))
                    .sorted()
                    .forEach(jars::add);
        }
        for (Path jar : jars) {
            urls.add(jar.toUri().toURL());
        }
    }

    public record LoadedDriver(
            Driver driver,
            Path jarPath,
            boolean downloaded,
            boolean cached,
            ClassLoader classLoader
    ) {
        void closeQuietly() {
            if (classLoader instanceof URLClassLoader urlClassLoader) {
                try {
                    urlClassLoader.close();
                } catch (IOException ignored) {
                    // Metaspace hygiene best-effort
                }
            }
        }
    }

    public record DownloadProgress(
            String mavenCoordinates,
            long downloadedBytes,
            long totalBytes,
            boolean active,
            boolean completed,
            boolean cached,
            String error
    ) {
        static DownloadProgress idle(String mavenCoordinates) {
            return new DownloadProgress(mavenCoordinates, 0, 0, false, false, false, null);
        }
    }

    /**
     * @deprecated use {@link JdbcMavenCoordinate}
     */
    @Deprecated
    public record MavenCoordinate(String groupId, String artifactId, String version) {
        public static MavenCoordinate parse(String coordinates) {
            JdbcMavenCoordinate coordinate = JdbcMavenCoordinate.parse(coordinates);
            return new MavenCoordinate(coordinate.groupId(), coordinate.artifactId(), coordinate.version());
        }

        public static MavenCoordinate parseFlexible(String input) {
            JdbcMavenCoordinate coordinate = JdbcMavenCoordinate.parseFlexible(input);
            return new MavenCoordinate(coordinate.groupId(), coordinate.artifactId(), coordinate.version());
        }

        public String fileName() {
            return artifactId + "-" + version + ".jar";
        }

        public String cacheKey() {
            return groupId + ":" + artifactId + ":" + version;
        }

        public String repositoryPath() {
            String groupPath = groupId.replace('.', '/');
            return groupPath + "/" + artifactId + "/" + version + "/" + fileName();
        }
    }
}
