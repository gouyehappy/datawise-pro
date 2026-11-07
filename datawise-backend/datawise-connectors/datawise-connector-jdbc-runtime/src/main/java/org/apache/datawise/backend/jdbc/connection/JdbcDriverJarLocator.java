package org.apache.datawise.backend.jdbc.connection;

import org.apache.datawise.backend.jdbc.support.JdbcDriverLoader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Driver;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;

/**
 * Locates JDBC driver JAR files in {@code config/drivers/}, including compatible artifact fallbacks.
 */
public final class JdbcDriverJarLocator {

    private static final Logger log = LoggerFactory.getLogger(JdbcDriverJarLocator.class);

    private final Path driversDir;

    public JdbcDriverJarLocator(Path driversDir) {
        this.driversDir = driversDir;
    }

    /** Hive JDBC dependency bundle lives in {@code drivers/hive/}. */
    public Path hiveBundleDirectory() {
        return driversDir.resolve("hive");
    }

    /**
     * Finds a local JAR for the requested Maven coordinate.
     * Prefer exact filename / same-version compatible artifacts; never silently use a
     * different version of the same driver class (e.g. ES 8.17 when 7.3 was requested).
     */
    public Optional<Path> findLocalJar(JdbcMavenCoordinate coordinate, String driverClass) throws IOException {
        Path exact = driversDir.resolve(coordinate.fileName());
        if (Files.isRegularFile(exact)) {
            return Optional.of(exact);
        }
        Path hiveExact = hiveBundleDirectory().resolve(coordinate.fileName());
        if (Files.isRegularFile(hiveExact)) {
            return Optional.of(hiveExact);
        }

        Set<String> acceptable = JdbcDriverCoordinateSupport.compatibleArtifacts(coordinate.artifactId());
        if (!acceptable.isEmpty()) {
            Optional<Path> sameVersion = findCompatibleJar(coordinate, acceptable, true);
            if (sameVersion.isPresent()) {
                return sameVersion;
            }
            Optional<Path> anyCompatible = findCompatibleJar(coordinate, acceptable, false);
            if (anyCompatible.isPresent()) {
                return anyCompatible;
            }
        }

        // Offline / non-Central drivers (GBase, DM, …): use any local version of the same artifact.
        if (JdbcDriverCoordinateSupport.allowsLocalVersionFallback(coordinate.artifactId())) {
            Optional<Path> localAnyVersion = findCompatibleJar(
                    coordinate,
                    Set.of(coordinate.artifactId()),
                    false
            );
            if (localAnyVersion.isPresent()) {
                return localAnyVersion;
            }
        }

        // Last resort: probe jars that look like this artifact family. Skip wrong versions.
        // Filename filter first so we do not Class.forName every JAR under config/drivers/.
        return findLocalJarByDriverClass(driverClass, coordinate, acceptable);
    }

    public List<String> listCachedJarNames() throws IOException {
        if (!Files.isDirectory(driversDir)) {
            return List.of();
        }
        List<String> names = new ArrayList<>();
        try (var stream = Files.list(driversDir)) {
            stream.filter(path -> Files.isRegularFile(path)
                            && path.getFileName().toString().toLowerCase().endsWith(".jar"))
                    .map(path -> path.getFileName().toString())
                    .sorted()
                    .forEach(names::add);
        }
        return List.copyOf(names);
    }

    private Optional<Path> findCompatibleJar(
            JdbcMavenCoordinate coordinate,
            Set<String> acceptable,
            boolean requireSameVersion
    ) throws IOException {
        for (Path jar : listJarPaths()) {
            JdbcMavenCoordinate local = JdbcDriverCoordinateSupport.tryParseJarFileName(jar.getFileName().toString());
            if (local == null || !acceptable.contains(local.artifactId())) {
                continue;
            }
            if (requireSameVersion && !coordinate.version().equals(local.version())) {
                continue;
            }
            log.info(
                    "Using compatible local JDBC driver {} instead of requested {}",
                    jar.getFileName(),
                    coordinate.fileName()
            );
            return Optional.of(jar);
        }
        return Optional.empty();
    }

    private static boolean isSameDriverFamily(
            JdbcMavenCoordinate requested,
            JdbcMavenCoordinate local,
            Set<String> acceptable
    ) {
        if (requested.artifactId().equals(local.artifactId())) {
            return true;
        }
        return !acceptable.isEmpty() && acceptable.contains(local.artifactId());
    }

    private Optional<Path> findLocalJarByDriverClass(
            String driverClass,
            JdbcMavenCoordinate coordinate,
            Set<String> acceptable
    ) throws IOException {
        if (driverClass == null || driverClass.isBlank()) {
            return Optional.empty();
        }
        String trimmed = driverClass.trim();
        for (Path jar : listJarPaths()) {
            JdbcMavenCoordinate local = JdbcDriverCoordinateSupport.tryParseJarFileName(jar.getFileName().toString());
            if (local == null || !isSameDriverFamily(coordinate, local, acceptable)) {
                continue;
            }
            if (!coordinate.version().equals(local.version())) {
                continue;
            }
            if (!jarContainsDriverClass(jar, trimmed)) {
                continue;
            }
            log.info("Using local JDBC driver {} matching driver class {}", jar.getFileName(), trimmed);
            return Optional.of(jar);
        }
        return Optional.empty();
    }

    private List<Path> listJarPaths() throws IOException {
        List<Path> jars = new ArrayList<>();
        collectJarPaths(driversDir, jars);
        Path hiveDir = hiveBundleDirectory();
        if (!hiveDir.equals(driversDir)) {
            collectJarPaths(hiveDir, jars);
        }
        return jars;
    }

    private static void collectJarPaths(Path directory, List<Path> jars) throws IOException {
        if (!Files.isDirectory(directory)) {
            return;
        }
        try (var stream = Files.list(directory)) {
            stream.filter(path -> Files.isRegularFile(path)
                            && path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".jar"))
                    .sorted()
                    .forEach(jars::add);
        }
    }

    private static boolean jarContainsDriverClass(Path jarPath, String driverClass) {
        try {
            URL jarUrl = jarPath.toUri().toURL();
            try (URLClassLoader classLoader = new URLClassLoader(
                    new URL[]{jarUrl},
                    JdbcDriverLoader.class.getClassLoader()
            )) {
                Class<?> clazz = Class.forName(driverClass, false, classLoader);
                return Driver.class.isAssignableFrom(clazz);
            }
        } catch (Exception ex) {
            return false;
        }
    }
}
