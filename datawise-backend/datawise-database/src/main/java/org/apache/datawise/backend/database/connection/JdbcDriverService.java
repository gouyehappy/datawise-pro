package org.apache.datawise.backend.database.connection;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.common.DbTypeCatalogEntry;
import org.apache.datawise.backend.domain.JdbcDriverCachedDto;
import org.apache.datawise.backend.domain.JdbcDriverCatalogDto;
import org.apache.datawise.backend.domain.JdbcDriverDownloadProgressDto;
import org.apache.datawise.backend.domain.JdbcDriverFamilyDto;
import org.apache.datawise.backend.domain.JdbcDriverResolveRequest;
import org.apache.datawise.backend.domain.JdbcDriverResolveResult;
import org.apache.datawise.backend.jdbc.connection.JdbcMavenCoordinate;
import org.apache.datawise.backend.jdbc.support.JdbcDriverDefaultsProvider;
import org.apache.datawise.backend.jdbc.support.JdbcDriverLoader;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
public class JdbcDriverService {

    private final JdbcDriverLoader jdbcDriverLoader;
    private final JdbcDriverDefaultsProvider defaultsProvider;

    public JdbcDriverService(
            JdbcDriverLoader jdbcDriverLoader,
            JdbcDriverDefaultsProvider defaultsProvider
    ) {
        this.jdbcDriverLoader = jdbcDriverLoader;
        this.defaultsProvider = defaultsProvider;
    }

    public JdbcDriverResolveResult resolve(JdbcDriverResolveRequest request) throws SQLException {
        if (request == null || request.mavenCoordinates() == null || request.mavenCoordinates().isBlank()) {
            throw new IllegalArgumentException("mavenCoordinates is required");
        }
        if (request.driverClass() == null || request.driverClass().isBlank()) {
            throw new IllegalArgumentException("driverClass is required");
        }
        String coordinates = JdbcDriverLoader.normalizeDriverInput(request.mavenCoordinates());
        String driverClass = request.driverClass().trim();
        try {
            var preloaded = jdbcDriverLoader.preloadIfPresent(coordinates, driverClass);
            if (preloaded.isPresent()) {
                var loaded = preloaded.get();
                return buildResult(coordinates, driverClass, loaded, false, true);
            }
            JdbcDriverLoader.LoadedDriver loaded = jdbcDriverLoader.ensureDriver(coordinates, driverClass);
            return buildResult(coordinates, driverClass, loaded, loaded.downloaded(), !loaded.downloaded());
        } catch (IOException ex) {
            if (jdbcDriverLoader.hasCachedJar(coordinates)) {
                throw new SQLException(
                        "Failed to load JDBC driver from local jar under config/drivers/: " + ex.getMessage(),
                        ex
                );
            }
            throw new SQLException("Failed to download JDBC driver: " + ex.getMessage(), ex);
        }
    }

    public JdbcDriverResolveResult install(JdbcDriverResolveRequest request) throws SQLException {
        return resolve(request);
    }

    public JdbcDriverDownloadProgressDto downloadProgress(String mavenCoordinates) {
        JdbcDriverLoader.DownloadProgress snapshot = jdbcDriverLoader.downloadProgress(mavenCoordinates);
        return new JdbcDriverDownloadProgressDto(
                snapshot.mavenCoordinates(),
                snapshot.downloadedBytes(),
                snapshot.totalBytes(),
                snapshot.active(),
                snapshot.completed(),
                snapshot.cached(),
                snapshot.error()
        );
    }

    /** Unified library: catalog families + cached JARs (orphans kept separately). */
    public JdbcDriverCatalogDto listCached() {
        try {
            List<JdbcDriverCachedDto> allJars = new ArrayList<>();
            long total = 0L;
            for (JdbcDriverLoader.CachedDriverJar jar : jdbcDriverLoader.listCachedDriverJars()) {
                allJars.add(new JdbcDriverCachedDto(
                        jar.fileName(),
                        jar.relativePath(),
                        jar.sizeBytes(),
                        jar.loadedInMemory()
                ));
                total += jar.sizeBytes();
            }

            Map<String, FamilyBuilder> families = buildCatalogFamilies();
            Set<String> claimed = new LinkedHashSet<>();

            for (JdbcDriverCachedDto jar : allJars) {
                String familyId = matchFamilyId(jar, families);
                if (familyId == null) {
                    continue;
                }
                FamilyBuilder builder = families.get(familyId);
                if (builder == null) {
                    continue;
                }
                builder.jars.add(jar);
                claimed.add(jar.relativePath());
            }

            List<JdbcDriverFamilyDto> familyDtos = new ArrayList<>();
            for (FamilyBuilder builder : families.values()) {
                familyDtos.add(builder.toDto());
            }
            familyDtos.sort(Comparator
                    .comparing((JdbcDriverFamilyDto f) -> !"installed".equals(f.status()) && !"loaded".equals(f.status()))
                    .thenComparing(JdbcDriverFamilyDto::label, String.CASE_INSENSITIVE_ORDER));

            List<JdbcDriverCachedDto> orphans = allJars.stream()
                    .filter(jar -> !claimed.contains(jar.relativePath()))
                    .toList();

            return new JdbcDriverCatalogDto(
                    List.copyOf(familyDtos),
                    List.copyOf(orphans),
                    List.copyOf(allJars),
                    total,
                    jdbcDriverLoader.driversDirectory().toString()
            );
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to list JDBC drivers: " + ex.getMessage(), ex);
        }
    }

    public boolean deleteCached(String relativePath) {
        try {
            return jdbcDriverLoader.deleteCachedJar(relativePath);
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to delete JDBC driver: " + ex.getMessage(), ex);
        }
    }

    public int deleteBundle(String bundleDir) {
        try {
            return jdbcDriverLoader.deleteCachedBundle(bundleDir);
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to delete JDBC driver bundle: " + ex.getMessage(), ex);
        }
    }

    /** Deletes all cached jars belonging to a catalog family (and hive bundle when applicable). */
    public int deleteFamily(String familyId) {
        if (familyId == null || familyId.isBlank()) {
            throw new IllegalArgumentException("familyId is required");
        }
        JdbcDriverCatalogDto catalog = listCached();
        JdbcDriverFamilyDto family = catalog.families().stream()
                .filter(item -> familyId.equals(item.id()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown driver family: " + familyId));
        int deleted = 0;
        if (family.bundle() && family.bundleDir() != null && !family.bundleDir().isBlank()) {
            deleted += deleteBundle(family.bundleDir());
        }
        for (JdbcDriverCachedDto jar : family.jars()) {
            if (family.bundle() && family.bundleDir() != null
                    && jar.relativePath().startsWith(family.bundleDir() + "/")) {
                continue;
            }
            if (deleteCached(jar.relativePath())) {
                deleted++;
            }
        }
        return deleted;
    }

    private Map<String, FamilyBuilder> buildCatalogFamilies() {
        Map<String, FamilyBuilder> families = new LinkedHashMap<>();
        for (DbType type : DbType.catalogListed()) {
            DbTypeCatalogEntry catalog = type.catalogEntry().orElse(null);
            if (catalog == null || !catalog.jdbcDriverRequired()) {
                continue;
            }
            String maven = catalog.driverMaven();
            if (maven == null || maven.isBlank()) {
                continue;
            }
            JdbcDriverDefaultsProvider.DriverDefaults defaults = defaultsProvider.defaultsFor(type.id())
                    .orElse(new JdbcDriverDefaultsProvider.DriverDefaults(
                            maven.trim(),
                            catalog.resolveDriverClass(type)
                    ));
            FamilyKey key = familyKey(defaults.mavenCoordinates(), defaults.driverClass(), type);
            FamilyBuilder existing = families.get(key.id());
            if (existing == null) {
                families.put(key.id(), new FamilyBuilder(
                        key.id(),
                        key.label(),
                        defaults.mavenCoordinates(),
                        defaults.driverClass(),
                        key.bundle(),
                        key.bundleDir(),
                        new ArrayList<>(List.of(type.id())),
                        new ArrayList<>()
                ));
            } else if (!existing.relatedDbTypes.contains(type.id())) {
                existing.relatedDbTypes.add(type.id());
            }
        }
        return families;
    }

    private static String matchFamilyId(JdbcDriverCachedDto jar, Map<String, FamilyBuilder> families) {
        String path = jar.relativePath().toLowerCase(Locale.ROOT);
        String file = jar.fileName().toLowerCase(Locale.ROOT);
        if (path.startsWith("hive/") || file.startsWith("hive-")
                || file.startsWith("libthrift") || file.startsWith("libfb303")
                || file.startsWith("hadoop-common")) {
            if (families.containsKey("hive")) {
                return "hive";
            }
        }
        for (FamilyBuilder family : families.values()) {
            if (family.bundle && family.bundleDir != null
                    && path.startsWith(family.bundleDir.toLowerCase(Locale.ROOT) + "/")) {
                return family.id;
            }
            String artifact = artifactFromMaven(family.defaultMaven);
            if (artifact != null && file.startsWith(artifact.toLowerCase(Locale.ROOT))) {
                return family.id;
            }
            // mysql-connector-java ↔ mysql-connector-j
            if ("mysql-connector-j".equalsIgnoreCase(artifact)
                    && file.startsWith("mysql-connector-java")) {
                return family.id;
            }
            if ("mysql-connector-java".equalsIgnoreCase(artifact)
                    && file.startsWith("mysql-connector-j")) {
                return family.id;
            }
        }
        return null;
    }

    private static String artifactFromMaven(String maven) {
        try {
            return JdbcMavenCoordinate.parseFlexible(maven).artifactId();
        } catch (Exception ex) {
            return null;
        }
    }

    private static FamilyKey familyKey(String maven, String driverClass, DbType type) {
        JdbcMavenCoordinate coordinate;
        try {
            coordinate = JdbcMavenCoordinate.parseFlexible(maven);
        } catch (Exception ex) {
            return new FamilyKey(
                    type.id().toLowerCase(Locale.ROOT),
                    type.getDisplayName(),
                    false,
                    null
            );
        }
        String artifact = coordinate.artifactId().toLowerCase(Locale.ROOT);
        if (artifact.startsWith("hive-") || "org.apache.hive.jdbc.HiveDriver".equals(driverClass)) {
            return new FamilyKey("hive", "Apache Hive", true, "hive");
        }
        if (artifact.startsWith("mysql-connector")) {
            return new FamilyKey("mysql", "MySQL", false, null);
        }
        if (artifact.equals("mariadb-java-client")) {
            return new FamilyKey("mariadb", "MariaDB", false, null);
        }
        if (artifact.equals("postgresql")) {
            return new FamilyKey("postgresql", "PostgreSQL", false, null);
        }
        if (artifact.startsWith("mssql-jdbc")) {
            return new FamilyKey("sqlserver", "SQL Server", false, null);
        }
        if (artifact.startsWith("ojdbc")) {
            return new FamilyKey("oracle", "Oracle", false, null);
        }
        if (artifact.startsWith("clickhouse")) {
            return new FamilyKey("clickhouse", "ClickHouse", false, null);
        }
        if (artifact.startsWith("sqlite")) {
            return new FamilyKey("sqlite", "SQLite", false, null);
        }
        if (artifact.startsWith("h2")) {
            return new FamilyKey("h2", "H2", false, null);
        }
        if (artifact.contains("elasticsearch") || artifact.contains("x-pack-sql")) {
            return new FamilyKey("elasticsearch", "Elasticsearch", false, null);
        }
        // Prefer catalog type id so greenplum/starrocks that share jars still merge by maven artifact.
        return new FamilyKey(artifact, type.getDisplayName(), false, null);
    }

    private JdbcDriverResolveResult buildResult(
            String requestedCoordinates,
            String driverClass,
            JdbcDriverLoader.LoadedDriver loaded,
            boolean downloaded,
            boolean cached
    ) {
        return new JdbcDriverResolveResult(
                requestedCoordinates,
                driverClass,
                loaded.jarPath().toString(),
                downloaded,
                cached
        );
    }

    private record FamilyKey(String id, String label, boolean bundle, String bundleDir) {
    }

    private static final class FamilyBuilder {
        private final String id;
        private final String label;
        private final String defaultMaven;
        private final String driverClass;
        private final boolean bundle;
        private final String bundleDir;
        private final List<String> relatedDbTypes;
        private final List<JdbcDriverCachedDto> jars;

        private FamilyBuilder(
                String id,
                String label,
                String defaultMaven,
                String driverClass,
                boolean bundle,
                String bundleDir,
                List<String> relatedDbTypes,
                List<JdbcDriverCachedDto> jars
        ) {
            this.id = id;
            this.label = label;
            this.defaultMaven = defaultMaven;
            this.driverClass = driverClass;
            this.bundle = bundle;
            this.bundleDir = bundleDir;
            this.relatedDbTypes = relatedDbTypes;
            this.jars = jars;
        }

        private JdbcDriverFamilyDto toDto() {
            long size = jars.stream().mapToLong(JdbcDriverCachedDto::sizeBytes).sum();
            boolean loaded = jars.stream().anyMatch(JdbcDriverCachedDto::loadedInMemory);
            String status = jars.isEmpty() ? "missing" : (loaded ? "loaded" : "installed");
            return new JdbcDriverFamilyDto(
                    id,
                    label,
                    defaultMaven,
                    driverClass,
                    List.copyOf(relatedDbTypes),
                    status,
                    bundle,
                    bundleDir,
                    jars.size(),
                    size,
                    List.copyOf(jars),
                    deliveryMode(id, relatedDbTypes, bundle)
            );
        }
    }

    /**
     * core = desktop core connectors; sidecar = heavy/multi-jar families for offline zip;
     * on-demand = Maven download on first connect.
     */
    static String deliveryMode(String familyId, List<String> relatedDbTypes, boolean bundle) {
        if (relatedDbTypes != null) {
            for (String type : relatedDbTypes) {
                if (type == null) {
                    continue;
                }
                String id = type.trim().toLowerCase(Locale.ROOT);
                if ("mysql".equals(id) || "mariadb".equals(id)
                        || "postgresql".equals(id) || "sqlite3".equals(id) || "sqlite".equals(id)) {
                    return "core";
                }
            }
        }
        String fid = familyId == null ? "" : familyId.trim().toLowerCase(Locale.ROOT);
        if (bundle || SIDECAR_FAMILY_IDS.contains(fid)) {
            return "sidecar";
        }
        return "on-demand";
    }

    private static final Set<String> SIDECAR_FAMILY_IDS = Set.of(
            "hive",
            "oracle",
            "sqlserver",
            "elasticsearch",
            "clickhouse",
            "db2",
            "sap",
            "teradata",
            "snowflake",
            "bigquery",
            "redshift",
            "presto",
            "trino",
            "kudu"
    );
}
