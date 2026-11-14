package org.apache.datawise.backend.database.backup;

import org.apache.datawise.backend.backup.BackupArtifactStore;
import org.apache.datawise.backend.backup.BackupObjectStorageMirror;
import org.apache.datawise.backend.backup.BackupPathSanitizer;
import org.apache.datawise.backend.backup.WorkbenchBackupService;
import org.apache.datawise.backend.backup.ZipArchiveSupport;
import org.apache.datawise.backend.backup.model.BackupManifest;
import org.apache.datawise.backend.backup.model.BackupPolicy;
import org.apache.datawise.backend.backup.model.BackupProgress;
import org.apache.datawise.backend.backup.model.BackupRun;
import org.apache.datawise.backend.backup.model.BackupStatsDocument;
import org.apache.datawise.backend.backup.model.BackupTableStat;
import org.apache.datawise.backend.config.BackupProperties;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.database.table.TableCatalogTableLister;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.security.UserContext;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
import java.util.zip.GZIPOutputStream;

@Component
public class DatabaseBackupService {

    private final ConnectionExecutionContext connectionContext;
    private final TableCatalogTableLister tableLister;
    private final StreamingSqlBackupWriter streamingWriter;
    private final BackupArtifactStore artifactStore;
    private final BackupProperties backupProperties;
    private final ExecutorService backupTableTaskExecutor;
    private final ObjectProvider<BackupObjectStorageMirror> objectStorageMirror;

    public DatabaseBackupService(
            ConnectionExecutionContext connectionContext,
            TableCatalogTableLister tableLister,
            StreamingSqlBackupWriter streamingWriter,
            BackupArtifactStore artifactStore,
            BackupProperties backupProperties,
            @Qualifier("backupTableTaskExecutor") ExecutorService backupTableTaskExecutor,
            ObjectProvider<BackupObjectStorageMirror> objectStorageMirror
    ) {
        this.connectionContext = connectionContext;
        this.tableLister = tableLister;
        this.streamingWriter = streamingWriter;
        this.artifactStore = artifactStore;
        this.backupProperties = backupProperties;
        this.backupTableTaskExecutor = backupTableTaskExecutor;
        this.objectStorageMirror = objectStorageMirror;
    }

    public DatabaseBackupResult backup(
            String tenantId,
            BackupRun run,
            BackupPolicy policy,
            Path destinationRoot,
            Supplier<Boolean> cancelCheck,
            java.util.function.Consumer<BackupProgress> progressCallback
    ) throws IOException {
        String connectionId = policy != null ? policy.getConnectionId() : null;
        String database = policy != null ? policy.getDatabase() : null;
        if (connectionId == null || connectionId.isBlank()) {
            throw new IllegalArgumentException("connectionId is required");
        }
        if (database == null || database.isBlank()) {
            throw new IllegalArgumentException("database is required");
        }

        ConnectionExecutionContext.ResolvedConnectionWithDatabase resolved =
                connectionContext.requireAvailableWithDatabaseForCurrentUser(
                        connectionId, database, "connection not found");
        ConnectionEntity entity = resolved.entity();
        String dbName = resolved.database();

        List<String> allTables = tableLister.listTables(entity, dbName);
        List<String> tables = filterTables(allTables, policy);
        boolean includeData = policy == null
                || !"structureOnly".equalsIgnoreCase(policy.getContentMode());

        String timestamp = BackupPathSanitizer.artifactTimestamp();
        Path artifactDir = artifactStore.databaseArtifactDir(
                destinationRoot, tenantId, connectionId, dbName, run.getId(), timestamp
        );
        Path tablesDir = artifactStore.tablesDir(artifactDir);
        Files.createDirectories(tablesDir);

        long started = System.currentTimeMillis();
        int parallelism = Math.max(1, Math.min(backupProperties.getTableParallelism(), Math.max(1, tables.size())));
        progressCallback.accept(new BackupProgress("tables", 0, tables.size()));

        Map<String, String> fileNames = allocateFileNames(tables);
        AtomicInteger completed = new AtomicInteger(0);
        UserContext.Snapshot snapshot = UserContext.snapshotOrNull();

        List<CompletableFuture<BackupTableStat>> futures = new ArrayList<>(tables.size());
        for (String tableName : tables) {
            String fileName = fileNames.get(tableName);
            futures.add(CompletableFuture.supplyAsync(
                    () -> UserContext.runAs(snapshot, () -> backupOneTable(
                            entity,
                            connectionId,
                            dbName,
                            tableName,
                            fileName,
                            includeData,
                            artifactDir,
                            cancelCheck,
                            completed,
                            tables.size(),
                            progressCallback
                    )),
                    backupTableTaskExecutor
            ));
        }

        List<BackupTableStat> tableStats = new ArrayList<>(tables.size());
        try {
            for (CompletableFuture<BackupTableStat> future : futures) {
                if (cancelCheck.get()) {
                    futures.forEach(f -> f.cancel(true));
                    throw new StreamingSqlBackupWriter.BackupCancelledException("cancelled during parallel table backup");
                }
                try {
                    tableStats.add(future.join());
                } catch (CompletionException ex) {
                    Throwable cause = ex.getCause() != null ? ex.getCause() : ex;
                    if (cause instanceof StreamingSqlBackupWriter.BackupCancelledException cancelled) {
                        futures.forEach(f -> f.cancel(true));
                        throw cancelled;
                    }
                    if (cause instanceof RuntimeException runtime) {
                        throw runtime;
                    }
                    throw new IllegalStateException(cause.getMessage(), cause);
                }
            }
        } catch (RuntimeException ex) {
            cleanupPartialTables(tablesDir);
            throw ex;
        }

        // Preserve original table order in stats / restore order
        Map<String, BackupTableStat> byName = new ConcurrentHashMap<>();
        for (BackupTableStat stat : tableStats) {
            byName.put(stat.getTableName(), stat);
        }
        List<BackupTableStat> orderedStats = new ArrayList<>();
        for (String tableName : tables) {
            BackupTableStat stat = byName.get(tableName);
            if (stat != null) {
                orderedStats.add(stat);
            }
        }

        int success = 0;
        int failed = 0;
        long totalRows = 0;
        long totalBytes = 0;
        List<String> warnings = new ArrayList<>();
        for (BackupTableStat stat : orderedStats) {
            if (BackupTableStat.STATUS_SUCCESS.equals(stat.getStatus())) {
                success++;
                totalRows += stat.getRowCount();
                totalBytes += stat.getSizeBytes();
            } else {
                failed++;
                warnings.add("table " + stat.getTableName() + ": " + stat.getError());
            }
        }

        if (failed > 0 && backupProperties.isFailFastOnTableError()) {
            cleanupPartialTables(tablesDir);
            throw new IllegalStateException("database backup failed for " + failed + " table(s): "
                    + String.join("; ", warnings));
        }

        long durationMs = System.currentTimeMillis() - started;
        BackupStatsDocument stats = new BackupStatsDocument();
        stats.setLayout(BackupStatsDocument.LAYOUT_PER_TABLE);
        stats.setTableCount(tables.size());
        stats.setSuccessTables(success);
        stats.setFailedTables(failed);
        stats.setTotalRows(totalRows);
        stats.setTotalBytes(totalBytes);
        stats.setDurationMs(durationMs);
        stats.setParallelism(parallelism);
        stats.setTables(orderedStats);
        artifactStore.writeStats(artifactDir, stats);

        BackupManifest manifest = buildManifest(
                tenantId,
                run,
                policy,
                entity,
                dbName,
                includeData,
                orderedStats,
                stats,
                warnings
        );
        artifactStore.writeManifest(artifactDir, manifest);
        BackupObjectStorageMirror mirror = objectStorageMirror.getIfAvailable();
        if (mirror != null) {
            mirror.mirrorArtifactIfEnabled(
                    artifactDir,
                    "database/"
                            + TenantIds.normalizeOrDefault(tenantId)
                            + "/"
                            + connectionId
                            + "/"
                            + run.getId()
            );
        }
        progressCallback.accept(new BackupProgress("tables", tables.size(), tables.size()));
        return new DatabaseBackupResult(artifactDir, manifest, stats);
    }

    private BackupTableStat backupOneTable(
            ConnectionEntity entity,
            String connectionId,
            String database,
            String tableName,
            String fileName,
            boolean includeData,
            Path artifactDir,
            Supplier<Boolean> cancelCheck,
            AtomicInteger completed,
            int total,
            java.util.function.Consumer<BackupProgress> progressCallback
    ) {
        BackupTableStat stat = new BackupTableStat(tableName, fileName);
        long started = System.currentTimeMillis();
        Path finalGz = artifactStore.tableArchivePath(artifactDir, fileName);
        Path tmpGz = finalGz.resolveSibling(fileName + ".tmp");
        try {
            if (cancelCheck.get()) {
                throw new StreamingSqlBackupWriter.BackupCancelledException("cancelled before table " + tableName);
            }
            Files.createDirectories(finalGz.getParent());
            try (OutputStream fileOut = Files.newOutputStream(tmpGz);
                 GZIPOutputStream gzip = new GZIPOutputStream(fileOut)) {
                long rows = streamingWriter.writeTable(
                        gzip,
                        entity,
                        connectionId,
                        database,
                        tableName,
                        includeData,
                        entity.getName(),
                        WorkbenchBackupService.resolveAppVersion(),
                        cancelCheck
                );
                stat.setRowCount(rows);
            }
            Files.move(tmpGz, finalGz, StandardCopyOption.REPLACE_EXISTING);
            stat.setSizeBytes(Files.size(finalGz));
            stat.setSha256(ZipArchiveSupport.sha256(finalGz));
            stat.setStatus(BackupTableStat.STATUS_SUCCESS);
        } catch (StreamingSqlBackupWriter.BackupCancelledException ex) {
            deleteQuietly(tmpGz);
            deleteQuietly(finalGz);
            throw ex;
        } catch (Exception ex) {
            if (ex instanceof InterruptedException || ex.getCause() instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            deleteQuietly(tmpGz);
            deleteQuietly(finalGz);
            stat.setStatus(BackupTableStat.STATUS_FAILED);
            stat.setError(ex.getMessage() != null ? ex.getMessage() : ex.getClass().getSimpleName());
            if (backupProperties.isFailFastOnTableError()) {
                throw new IllegalStateException("table backup failed: " + tableName + " — " + stat.getError(), ex);
            }
        } finally {
            stat.setDurationMs(System.currentTimeMillis() - started);
            int done = completed.incrementAndGet();
            progressCallback.accept(new BackupProgress("tables", done, total));
        }
        return stat;
    }

    private BackupManifest buildManifest(
            String tenantId,
            BackupRun run,
            BackupPolicy policy,
            ConnectionEntity entity,
            String database,
            boolean includeData,
            List<BackupTableStat> orderedStats,
            BackupStatsDocument stats,
            List<String> warnings
    ) {
        BackupManifest manifest = new BackupManifest();
        manifest.setArtifactId(run.getId());
        manifest.setType(BackupPolicy.TYPE_DATABASE);
        manifest.setTenantId(tenantId);
        manifest.setCreatedAt(Instant.now());
        manifest.setCreatedByUserId(run.getCreatedByUserId());
        manifest.setTrigger(run.getTrigger());
        manifest.setPolicyId(run.getPolicyId());
        manifest.setStatus(stats.getFailedTables() > 0 ? BackupRun.STATUS_PARTIAL : BackupRun.STATUS_SUCCESS);
        manifest.setAppVersion(WorkbenchBackupService.resolveAppVersion());
        manifest.getWarnings().addAll(warnings);

        BackupManifest.BackupManifestEncryption encryption = new BackupManifest.BackupManifestEncryption();
        encryption.setAlg("none");
        encryption.setKeySource("none");
        manifest.setEncryption(encryption);

        BackupManifest.BackupManifestDatabase db = new BackupManifest.BackupManifestDatabase();
        db.setConnectionId(entity.getId());
        db.setConnectionName(entity.getName());
        db.setDbType(entity.getDbType());
        db.setDatabase(database);
        db.setContentMode(includeData ? "structureAndData" : "structureOnly");
        db.setEngine("streaming_sql_v1");
        db.setConsistency("best_effort");
        db.setTableCount(stats.getTableCount());
        db.setRowEstimate(stats.getTotalRows());
        db.setMaxRowsApplied(null);
        db.setDurationMs(stats.getDurationMs());
        db.setLayout(BackupStatsDocument.LAYOUT_PER_TABLE);
        db.setParallelism(stats.getParallelism());
        db.setSuccessTables(stats.getSuccessTables());
        db.setFailedTables(stats.getFailedTables());
        db.setTotalBytes(stats.getTotalBytes());
        List<String> order = new ArrayList<>();
        for (BackupTableStat tableStat : orderedStats) {
            order.add(tableStat.getTableName());
            if (BackupTableStat.STATUS_SUCCESS.equals(tableStat.getStatus())) {
                manifest.getFiles().add(new BackupManifest.BackupManifestFile(
                        BackupArtifactStore.DATABASE_TABLES_DIR + "/" + tableStat.getFileName(),
                        tableStat.getSizeBytes(),
                        tableStat.getSha256()
                ));
            }
        }
        db.setTableOrder(order);
        manifest.setDatabase(db);
        return manifest;
    }

    private static Map<String, String> allocateFileNames(List<String> tables) {
        Map<String, String> names = new ConcurrentHashMap<>();
        Set<String> used = ConcurrentHashMap.newKeySet();
        for (String table : tables) {
            String base = sanitizeTableFileName(table);
            String candidate = base + ".sql.gz";
            int suffix = 2;
            while (!used.add(candidate)) {
                candidate = base + "_" + suffix + ".sql.gz";
                suffix++;
            }
            names.put(table, candidate);
        }
        return names;
    }

    static String sanitizeTableFileName(String tableName) {
        if (tableName == null || tableName.isBlank()) {
            return "table";
        }
        String safe = tableName.trim().replaceAll("[^a-zA-Z0-9._-]+", "_");
        safe = safe.replaceAll("^_+|_+$", "");
        if (safe.isBlank() || safe.matches("_+")) {
            return "table";
        }
        if (safe.length() > 120) {
            safe = safe.substring(0, 120);
        }
        return safe;
    }

    private List<String> filterTables(List<String> allTables, BackupPolicy policy) {
        if (policy == null) {
            return allTables;
        }
        Set<String> include = toSet(policy.getTableInclude());
        Set<String> exclude = toSet(policy.getTableExclude());
        List<String> filtered = new ArrayList<>();
        for (String table : allTables) {
            if (!include.isEmpty() && !include.contains(table)) {
                continue;
            }
            if (exclude.contains(table)) {
                continue;
            }
            filtered.add(table);
        }
        return filtered;
    }

    private static Set<String> toSet(List<String> values) {
        Set<String> set = new HashSet<>();
        if (values != null) {
            for (String value : values) {
                if (value != null && !value.isBlank()) {
                    set.add(value.trim());
                }
            }
        }
        return set;
    }

    private static void cleanupPartialTables(Path tablesDir) {
        if (!Files.isDirectory(tablesDir)) {
            return;
        }
        try (var walk = Files.walk(tablesDir)) {
            walk.sorted(java.util.Comparator.reverseOrder()).forEach(DatabaseBackupService::deleteQuietly);
        } catch (IOException ignored) {
        }
    }

    private static void deleteQuietly(Path path) {
        if (path == null) {
            return;
        }
        try {
            Files.deleteIfExists(path);
        } catch (IOException ignored) {
        }
    }

    public record DatabaseBackupResult(
            Path artifactDir,
            BackupManifest manifest,
            BackupStatsDocument stats
    ) {
    }
}
