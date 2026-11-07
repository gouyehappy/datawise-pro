package org.apache.datawise.backend.backup;

import org.apache.datawise.backend.backup.model.BackupManifest;
import org.apache.datawise.backend.backup.model.BackupPolicy;
import org.apache.datawise.backend.backup.model.BackupProgress;
import org.apache.datawise.backend.backup.model.BackupRun;
import org.apache.datawise.backend.config.StorageProperties;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.apache.datawise.backend.domain.TenantIds;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.function.Supplier;

@Service
public class WorkbenchBackupService {

    static final String MEMORY_H2_METADATA_WARNING =
            "storageBackend=jdbc with in-memory H2: identity metadata is not portable across machines";

    private static final Set<String> EXCLUDED_PREFIXES = Set.of(
            ConfigPaths.SCHEMA_CACHE_DIR + "/",
            "cache/",
            "logs/",
            ConfigPaths.BACKUPS_DIR + "/"
    );

    private static final String MASTER_KEY_FILE = ".datawise-master-key";

    private final ConfigDirectoryService configDirectory;
    private final StorageProperties storageProperties;
    private final BackupArtifactStore artifactStore;
    private final ObjectProvider<JdbcMetadataBackupExporter> metadataExporter;

    public WorkbenchBackupService(
            ConfigDirectoryService configDirectory,
            StorageProperties storageProperties,
            BackupArtifactStore artifactStore,
            ObjectProvider<JdbcMetadataBackupExporter> metadataExporter
    ) {
        this.configDirectory = configDirectory;
        this.storageProperties = storageProperties;
        this.artifactStore = artifactStore;
        this.metadataExporter = metadataExporter;
    }

    public WorkbenchBackupResult backup(
            String tenantId,
            BackupRun run,
            BackupPolicy policy,
            Path destinationRoot,
            Supplier<Boolean> cancelCheck,
            java.util.function.Consumer<BackupProgress> progressCallback
    ) throws IOException {
        if (cancelCheck.get()) {
            throw new BackupCancelledException("cancelled before start");
        }
        String timestamp = BackupPathSanitizer.artifactTimestamp();
        Path artifactDir = artifactStore.workbenchArtifactDir(destinationRoot, tenantId, run.getId(), timestamp);
        Path stagingDir = Files.createTempDirectory("dw-workbench-staging-");
        Path tmpZip = artifactDir.resolve(BackupArtifactStore.WORKBENCH_ARCHIVE + ".tmp");
        Path finalZip = artifactDir.resolve(BackupArtifactStore.WORKBENCH_ARCHIVE);

        try {
            List<String> includedPaths = new ArrayList<>(collectWorkbenchPaths(tenantId, policy));
            progressCallback.accept(new BackupProgress("collect", 0, includedPaths.size()));

            int index = 0;
            for (String relative : includedPaths) {
                if (cancelCheck.get()) {
                    throw new BackupCancelledException("cancelled during collect");
                }
                Path source = configDirectory.resolve(relative);
                if (Files.exists(source)) {
                    Path target = stagingDir.resolve(relative);
                    Files.createDirectories(target.getParent());
                    if (Files.isDirectory(source)) {
                        copyTree(source, target);
                    } else {
                        Files.copy(source, target);
                    }
                }
                index++;
                progressCallback.accept(new BackupProgress("collect", index, includedPaths.size()));
            }

            List<String> warnings = new ArrayList<>();
            if (storageProperties.isJdbc()) {
                if (storageProperties.isMemoryH2Metadata()) {
                    warnings.add(MEMORY_H2_METADATA_WARNING);
                } else {
                    JdbcMetadataBackupExporter exporter = metadataExporter.getIfAvailable();
                    if (exporter != null) {
                        List<String> metadataPaths = exporter.exportTo(stagingDir, policy);
                        includedPaths.addAll(metadataPaths);
                        includedPaths = includedPaths.stream().distinct().sorted().toList();
                        progressCallback.accept(new BackupProgress("metadata", metadataPaths.size(), metadataPaths.size()));
                    } else {
                        warnings.add(
                                "storageBackend=jdbc: metadata exporter unavailable; identity may require external DB dump"
                        );
                    }
                }
            }

            Files.createDirectories(artifactDir);
            ZipArchiveSupport.createZipFromDirectory(tmpZip, stagingDir, "");
            Files.move(tmpZip, finalZip, java.nio.file.StandardCopyOption.REPLACE_EXISTING);

            BackupManifest manifest = buildManifest(tenantId, run, policy, includedPaths, finalZip, warnings);
            artifactStore.writeManifest(artifactDir, manifest);

            return new WorkbenchBackupResult(artifactDir, manifest);
        } finally {
            deleteRecursively(stagingDir);
            Files.deleteIfExists(tmpZip);
        }
    }

    List<String> collectWorkbenchPaths(String tenantId, BackupPolicy policy) throws IOException {
        String normalizedTenant = TenantIds.normalizeOrDefault(tenantId);
        List<String> paths = new ArrayList<>();
        Path root = configDirectory.getRoot();

        addIfExists(paths, ConfigPaths.USERS);
        addIfExists(paths, ConfigPaths.TENANTS_INDEX);
        addIfExists(paths, ConfigPaths.OIDC);
        addIfExists(paths, ConfigPaths.TEAMS);
        addIfExists(paths, ConfigPaths.tenantMeta(normalizedTenant));
        addIfExists(paths, ConfigPaths.tenantRoles(normalizedTenant));
        addIfExists(paths, ConfigPaths.tenantMemberships(normalizedTenant));
        addIfExists(paths, ConfigPaths.tenantTeams(normalizedTenant));
        addIfExists(paths, ConfigPaths.tenantConnections(normalizedTenant));
        addIfExists(paths, ConfigPaths.tenantOidc(normalizedTenant));
        addIfExists(paths, ConfigPaths.tenantOutboundWebhooks(normalizedTenant));
        addIfExists(paths, ConfigPaths.tenantDataQualityTemplates(normalizedTenant));
        addIfExists(paths, ConfigPaths.tenantSqlSnippetsShared(normalizedTenant));
        addIfExists(paths, ConfigPaths.tenantProjectsDir(normalizedTenant));

        Path usersDir = root.resolve(ConfigPaths.USERS_DIR);
        if (Files.isDirectory(usersDir)) {
            try (var walk = Files.walk(usersDir)) {
                walk.filter(Files::isRegularFile)
                        .map(path -> root.relativize(path).toString().replace('\\', '/'))
                        .filter(this::includeRelativePath)
                        .forEach(paths::add);
            }
        }

        if (policy != null && policy.isIncludeSqlHistory()) {
            addIfExists(paths, ConfigPaths.SQL_HISTORY);
        }
        if (policy != null && policy.isIncludePlugins()) {
            addIfExists(paths, "plugins");
        }
        if (policy != null && policy.isIncludeDrivers()) {
            addIfExists(paths, "drivers");
        }

        return paths.stream().distinct().sorted().toList();
    }

    private BackupManifest buildManifest(
            String tenantId,
            BackupRun run,
            BackupPolicy policy,
            List<String> includedPaths,
            Path zipFile,
            List<String> warnings
    ) throws IOException {
        BackupManifest manifest = new BackupManifest();
        manifest.setArtifactId(run.getId());
        manifest.setType(BackupPolicy.TYPE_WORKBENCH);
        manifest.setTenantId(TenantIds.normalizeOrDefault(tenantId));
        manifest.setCreatedAt(Instant.now());
        manifest.setCreatedByUserId(run.getCreatedByUserId());
        manifest.setTrigger(run.getTrigger());
        manifest.setPolicyId(run.getPolicyId());
        manifest.setStatus(BackupRun.STATUS_SUCCESS);
        manifest.setAppVersion(resolveAppVersion());

        BackupManifest.BackupManifestEncryption encryption = new BackupManifest.BackupManifestEncryption();
        encryption.setAlg("none");
        encryption.setKeySource("none");
        manifest.setEncryption(encryption);

        BackupManifest.BackupManifestWorkbench workbench = new BackupManifest.BackupManifestWorkbench();
        workbench.setIncludePlugins(policy != null && policy.isIncludePlugins());
        workbench.setIncludeDrivers(policy != null && policy.isIncludeDrivers());
        workbench.setIncludeSqlHistory(policy == null || policy.isIncludeSqlHistory());
        workbench.setStorageBackend(storageProperties.getBackend());
        workbench.setMasterKeyIncluded(false);
        workbench.setPaths(includedPaths);
        manifest.setWorkbench(workbench);

        if (warnings != null && !warnings.isEmpty()) {
            manifest.getWarnings().addAll(warnings);
        }

        String sha256 = ZipArchiveSupport.sha256(zipFile);
        manifest.getFiles().add(new BackupManifest.BackupManifestFile(
                BackupArtifactStore.WORKBENCH_ARCHIVE,
                Files.size(zipFile),
                sha256
        ));
        return manifest;
    }

    private boolean includeRelativePath(String relative) {
        if (relative == null || relative.isBlank()) {
            return false;
        }
        String normalized = relative.replace('\\', '/');
        if (normalized.contains("..")) {
            return false;
        }
        if (normalized.equals(MASTER_KEY_FILE) || normalized.endsWith("/" + MASTER_KEY_FILE)) {
            return false;
        }
        for (String prefix : EXCLUDED_PREFIXES) {
            if (normalized.startsWith(prefix) || normalized.contains("/" + prefix)) {
                return false;
            }
        }
        if (normalized.contains(".corrupt-")) {
            return false;
        }
        return true;
    }

    private void addIfExists(List<String> paths, String relative) {
        if (Files.exists(configDirectory.resolve(relative))) {
            paths.add(relative);
        }
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

    public static String resolveAppVersion() {
        Package pkg = WorkbenchBackupService.class.getPackage();
        String version = pkg != null ? pkg.getImplementationVersion() : null;
        return version != null && !version.isBlank() ? version : "dev";
    }

    public record WorkbenchBackupResult(Path artifactDir, BackupManifest manifest) {
    }

    public static class BackupCancelledException extends RuntimeException {
        public BackupCancelledException(String message) {
            super(message);
        }
    }
}
