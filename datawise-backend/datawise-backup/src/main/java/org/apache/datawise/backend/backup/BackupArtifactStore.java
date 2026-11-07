package org.apache.datawise.backend.backup;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.backup.model.BackupManifest;
import org.apache.datawise.backend.backup.model.BackupPolicy;
import org.apache.datawise.backend.config.BackupProperties;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.apache.datawise.backend.domain.TenantIds;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

@Service
public class BackupArtifactStore {

    public static final String MANIFEST_FILE = "manifest.json";
    public static final String WORKBENCH_ARCHIVE = "workbench.dwbak";
    /** Legacy single-file database archive. */
    public static final String DATABASE_ARCHIVE = "data.sql.gz";
    public static final String DATABASE_TABLES_DIR = "tables";
    public static final String STATS_FILE = "stats.json";

    public Path tablesDir(Path artifactDir) {
        return artifactDir.resolve(DATABASE_TABLES_DIR);
    }

    public Path tableArchivePath(Path artifactDir, String fileName) {
        return tablesDir(artifactDir).resolve(fileName);
    }

    public void writeStats(Path artifactDir, org.apache.datawise.backend.backup.model.BackupStatsDocument stats)
            throws IOException {
        Files.createDirectories(artifactDir);
        objectMapper.writerWithDefaultPrettyPrinter()
                .writeValue(artifactDir.resolve(STATS_FILE).toFile(), stats);
    }

    public org.apache.datawise.backend.backup.model.BackupStatsDocument readStats(Path artifactDir) throws IOException {
        Path statsPath = artifactDir.resolve(STATS_FILE);
        if (!Files.exists(statsPath)) {
            return null;
        }
        return objectMapper.readValue(
                statsPath.toFile(),
                org.apache.datawise.backend.backup.model.BackupStatsDocument.class
        );
    }

    private final ConfigDirectoryService configDirectory;
    private final BackupProperties backupProperties;
    private final ObjectMapper objectMapper;

    public BackupArtifactStore(
            ConfigDirectoryService configDirectory,
            BackupProperties backupProperties,
            ObjectMapper objectMapper
    ) {
        this.configDirectory = configDirectory;
        this.backupProperties = backupProperties;
        this.objectMapper = objectMapper;
    }

    public Path resolveRoot(String tenantId, BackupPolicy policy) {
        String destination = policy != null ? policy.getDestinationRoot() : null;
        return BackupPathSanitizer.resolveDestinationRoot(configDirectory, backupProperties, destination);
    }

    public Path resolveRoot(String tenantId, String destinationRoot) {
        return BackupPathSanitizer.resolveDestinationRoot(configDirectory, backupProperties, destinationRoot);
    }

    public Path workbenchArtifactDir(Path root, String tenantId, String runId, String timestamp) {
        return root.resolve("workbench")
                .resolve(TenantIds.normalizeOrDefault(tenantId))
                .resolve(timestamp + "-" + runId);
    }

    public Path databaseArtifactDir(
            Path root,
            String tenantId,
            String connectionId,
            String database,
            String runId,
            String timestamp
    ) {
        return root.resolve("database")
                .resolve(TenantIds.normalizeOrDefault(tenantId))
                .resolve(sanitizeSegment(connectionId))
                .resolve(sanitizeSegment(database))
                .resolve(timestamp + "-" + runId);
    }

    public void writeManifest(Path artifactDir, BackupManifest manifest) throws IOException {
        Files.createDirectories(artifactDir);
        objectMapper.writerWithDefaultPrettyPrinter()
                .writeValue(artifactDir.resolve(MANIFEST_FILE).toFile(), manifest);
    }

    public BackupManifest readManifest(Path artifactDir) throws IOException {
        Path manifestPath = artifactDir.resolve(MANIFEST_FILE);
        if (!Files.exists(manifestPath)) {
            throw new IllegalArgumentException("manifest not found: " + artifactDir);
        }
        BackupManifest manifest = objectMapper.readValue(manifestPath.toFile(), BackupManifest.class);
        if (manifest.getSchemaVersion() > BackupManifest.SCHEMA_VERSION) {
            throw new IllegalArgumentException("unsupported manifest schema version: " + manifest.getSchemaVersion());
        }
        return manifest;
    }

    public Optional<BackupManifest> findManifestByArtifactId(Path root, String artifactId) {
        if (artifactId == null || artifactId.isBlank()) {
            return Optional.empty();
        }
        try (Stream<Path> dirs = Files.walk(root)) {
            return dirs.filter(Files::isDirectory)
                    .filter(dir -> dir.getFileName() != null && dir.getFileName().toString().endsWith("-" + artifactId))
                    .sorted(Comparator.reverseOrder())
                    .map(dir -> {
                        try {
                            return readManifest(dir);
                        } catch (IOException ex) {
                            return null;
                        }
                    })
                    .filter(m -> m != null && artifactId.equals(m.getArtifactId()))
                    .findFirst();
        } catch (IOException ex) {
            return Optional.empty();
        }
    }

    public Optional<Path> findArtifactDir(Path root, String artifactId) {
        if (artifactId == null || artifactId.isBlank() || !Files.isDirectory(root)) {
            return Optional.empty();
        }
        try (Stream<Path> dirs = Files.walk(root)) {
            return dirs.filter(Files::isDirectory)
                    .filter(dir -> dir.getFileName() != null && dir.getFileName().toString().endsWith("-" + artifactId))
                    .findFirst();
        } catch (IOException ex) {
            return Optional.empty();
        }
    }

    public List<ArtifactSummary> listArtifacts(
            Path root,
            String typeFilter,
            String connectionIdFilter,
            String databaseFilter
    ) throws IOException {
        if (!Files.isDirectory(root)) {
            return List.of();
        }
        List<ArtifactSummary> results = new ArrayList<>();
        try (Stream<Path> dirs = Files.walk(root, 6)) {
            dirs.filter(Files::isDirectory)
                    .filter(dir -> Files.exists(dir.resolve(MANIFEST_FILE)))
                    .forEach(dir -> {
                        try {
                            BackupManifest manifest = readManifest(dir);
                            if (typeFilter != null && !typeFilter.isBlank()
                                    && !typeFilter.equalsIgnoreCase(manifest.getType())) {
                                return;
                            }
                            if (connectionIdFilter != null && !connectionIdFilter.isBlank()
                                    && manifest.getDatabase() != null
                                    && !connectionIdFilter.equals(manifest.getDatabase().getConnectionId())) {
                                return;
                            }
                            if (databaseFilter != null && !databaseFilter.isBlank()
                                    && manifest.getDatabase() != null
                                    && !databaseFilter.equalsIgnoreCase(manifest.getDatabase().getDatabase())) {
                                return;
                            }
                            results.add(new ArtifactSummary(
                                    manifest.getArtifactId(),
                                    manifest.getType(),
                                    dir.toString(),
                                    manifest.getCreatedAt(),
                                    manifest.getStatus(),
                                    manifest.getTenantId()
                            ));
                        } catch (IOException ignored) {
                            // skip corrupt artifacts
                        }
                    });
        }
        results.sort(Comparator.comparing(ArtifactSummary::createdAt, Comparator.nullsLast(Comparator.reverseOrder())));
        return results;
    }

    public void deleteArtifact(Path artifactDir) throws IOException {
        if (!Files.exists(artifactDir)) {
            return;
        }
        try (Stream<Path> walk = Files.walk(artifactDir)) {
            walk.sorted(Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException ex) {
                    throw new java.io.UncheckedIOException(ex);
                }
            });
        }
    }

    public long freeBytes(Path root) throws IOException {
        Path check = Files.isDirectory(root) ? root : root.getParent();
        if (check == null || !Files.exists(check)) {
            return Long.MAX_VALUE;
        }
        return check.toFile().getUsableSpace();
    }

    private static String sanitizeSegment(String value) {
        if (value == null || value.isBlank()) {
            return "default";
        }
        return value.replaceAll("[^a-zA-Z0-9._-]", "_");
    }

    public record ArtifactSummary(
            String artifactId,
            String type,
            String path,
            java.time.Instant createdAt,
            String status,
            String tenantId
    ) {
    }
}
