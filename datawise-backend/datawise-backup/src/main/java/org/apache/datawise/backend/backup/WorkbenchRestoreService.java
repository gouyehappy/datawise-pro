package org.apache.datawise.backend.backup;

import org.apache.datawise.backend.backup.model.BackupManifest;
import org.apache.datawise.backend.backup.model.BackupPolicy;
import org.apache.datawise.backend.backup.model.RestoreJob;
import org.apache.datawise.backend.config.StorageProperties;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.apache.datawise.backend.configstore.ConnectionStore;
import org.apache.datawise.backend.domain.TenantIds;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

@Service
public class WorkbenchRestoreService {

    private final ConfigDirectoryService configDirectory;
    private final ConnectionStore connectionStore;
    private final BackupArtifactStore artifactStore;
    private final StorageProperties storageProperties;
    private final ObjectProvider<JdbcMetadataBackupImporter> metadataImporter;

    public WorkbenchRestoreService(
            ConfigDirectoryService configDirectory,
            ConnectionStore connectionStore,
            BackupArtifactStore artifactStore,
            StorageProperties storageProperties,
            ObjectProvider<JdbcMetadataBackupImporter> metadataImporter
    ) {
        this.configDirectory = configDirectory;
        this.connectionStore = connectionStore;
        this.artifactStore = artifactStore;
        this.storageProperties = storageProperties;
        this.metadataImporter = metadataImporter;
    }

    public RestoreGuidance restore(
            Path artifactDir,
            RestoreJob job,
            java.util.function.Consumer<org.apache.datawise.backend.backup.model.BackupProgress> progressCallback
    ) throws Exception {
        BackupManifest manifest = artifactStore.readManifest(artifactDir);
        verifyManifest(manifest, artifactDir);

        Path zipFile = artifactDir.resolve(BackupArtifactStore.WORKBENCH_ARCHIVE);
        ZipArchiveSupport.verifyChecksum(zipFile, requireFileChecksum(manifest, BackupArtifactStore.WORKBENCH_ARCHIVE));

        Path extractDir = Files.createTempDirectory("dw-workbench-restore-");
        try {
            ZipArchiveSupport.extractZip(zipFile, extractDir);
            String mode = job.getMode() != null ? job.getMode() : RestoreJob.MODE_FULL;

            if (RestoreJob.MODE_CONNECTIONS_ONLY.equals(mode)) {
                restoreConnectionsOnly(extractDir, manifest.getTenantId());
            } else if (RestoreJob.MODE_FULL.equals(mode)) {
                restoreFull(extractDir, manifest, progressCallback);
            } else {
                throw new IllegalArgumentException("unsupported workbench restore mode: " + mode);
            }

            return new RestoreGuidance(
                    true,
                    "Workbench restore completed. Restart the application or reload config caches if connections do not appear immediately.",
                    List.of("Verify DATAWISE_MASTER_KEY if encrypted connection passwords fail to decrypt.")
            );
        } finally {
            deleteRecursively(extractDir);
        }
    }

    private void restoreConnectionsOnly(Path extractDir, String tenantId) throws Exception {
        String normalizedTenant = TenantIds.normalizeOrDefault(tenantId);
        Path connectionsFile = extractDir.resolve(ConfigPaths.tenantConnections(normalizedTenant));
        if (!Files.exists(connectionsFile)) {
            throw new IllegalArgumentException("connections.xml not found in backup for tenant " + normalizedTenant);
        }
        String xml = Files.readString(connectionsFile, StandardCharsets.UTF_8);
        connectionStore.importConnectionsXml(xml);
    }

    private void restoreFull(
            Path extractDir,
            BackupManifest manifest,
            java.util.function.Consumer<org.apache.datawise.backend.backup.model.BackupProgress> progressCallback
    ) throws IOException {
        List<String> paths = manifest.getWorkbench() != null
                ? manifest.getWorkbench().getPaths()
                : List.of();
        int total = Math.max(1, paths.size());
        int index = 0;
        for (String relative : paths) {
            if (relative != null && relative.replace('\\', '/').startsWith(JdbcMetadataBackupTables.METADATA_DIR + "/")) {
                index++;
                progressCallback.accept(new org.apache.datawise.backend.backup.model.BackupProgress("restore", index, total));
                continue;
            }
            Path source = extractDir.resolve(relative);
            if (!Files.exists(source)) {
                continue;
            }
            Path target = configDirectory.resolve(relative);
            Files.createDirectories(target.getParent());
            if (Files.isDirectory(source)) {
                copyTree(source, target);
            } else {
                Files.copy(source, target, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            }
            index++;
            progressCallback.accept(new org.apache.datawise.backend.backup.model.BackupProgress("restore", index, total));
        }

        if (storageProperties.isJdbc()) {
            Path metadataDir = extractDir.resolve(JdbcMetadataBackupTables.METADATA_DIR);
            JdbcMetadataBackupImporter importer = metadataImporter.getIfAvailable();
            if (importer != null && Files.isDirectory(metadataDir)) {
                boolean includeSqlHistory = manifest.getWorkbench() == null
                        || manifest.getWorkbench().isIncludeSqlHistory();
                importer.apply(metadataDir, includeSqlHistory);
                progressCallback.accept(new org.apache.datawise.backend.backup.model.BackupProgress(
                        "metadata", 1, 1
                ));
            }
        }
    }

    public void verifyManifest(BackupManifest manifest, Path artifactDir) throws IOException {
        if (!BackupPolicy.TYPE_WORKBENCH.equals(manifest.getType())) {
            throw new IllegalArgumentException("artifact is not a workbench backup");
        }
        String alg = manifest.getEncryption() != null ? manifest.getEncryption().getAlg() : "none";
        if (alg != null && !"none".equalsIgnoreCase(alg)) {
            throw new IllegalArgumentException("encrypted backups are not supported yet");
        }
        for (BackupManifest.BackupManifestFile file : manifest.getFiles()) {
            Path dataFile = artifactDir.resolve(file.getName());
            ZipArchiveSupport.verifyChecksum(dataFile, file.getSha256());
        }
    }

    private static String requireFileChecksum(BackupManifest manifest, String name) {
        String sha256 = manifest.getFiles().stream()
                .filter(f -> name.equals(f.getName()))
                .map(BackupManifest.BackupManifestFile::getSha256)
                .findFirst()
                .orElse(null);
        if (sha256 == null || sha256.isBlank()) {
            throw new IllegalArgumentException("missing sha256 for " + name);
        }
        return sha256;
    }

    private static void copyTree(Path source, Path target) throws IOException {
        Files.createDirectories(target);
        try (var walk = Files.walk(source)) {
            walk.forEach(path -> {
                try {
                    Path dest = target.resolve(source.relativize(path));
                    if (Files.isDirectory(path)) {
                        Files.createDirectories(dest);
                    } else {
                        Files.createDirectories(dest.getParent());
                        Files.copy(path, dest, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                    }
                } catch (IOException ex) {
                    throw new java.io.UncheckedIOException(ex);
                }
            });
        }
    }

    private static void deleteRecursively(Path dir) {
        if (dir == null || !Files.exists(dir)) {
            return;
        }
        try (var walk = Files.walk(dir)) {
            walk.sorted(java.util.Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException ignored) {
                }
            });
        } catch (IOException ignored) {
        }
    }

    public record RestoreGuidance(boolean ok, String message, List<String> hints) {
    }
}
