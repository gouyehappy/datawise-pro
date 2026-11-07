package org.apache.datawise.backend.database.backup;

import org.apache.datawise.backend.backup.BackupArtifactStore;
import org.apache.datawise.backend.backup.ZipArchiveSupport;
import org.apache.datawise.backend.backup.model.BackupManifest;
import org.apache.datawise.backend.backup.model.BackupPolicy;
import org.apache.datawise.backend.backup.model.BackupProgress;
import org.apache.datawise.backend.backup.model.BackupStatsDocument;
import org.apache.datawise.backend.backup.model.BackupTableStat;
import org.apache.datawise.backend.backup.model.RestoreJob;
import org.apache.datawise.backend.common.support.ConnectionEnvironmentSupport;
import org.apache.datawise.backend.connector.api.support.SqlWriteClassifier;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.database.sql.SqlReviewService;
import org.apache.datawise.backend.database.sql.SqlService;
import org.apache.datawise.backend.domain.ExecuteSqlRequest;
import org.apache.datawise.backend.domain.SqlReviewRequest;
import org.apache.datawise.backend.domain.SqlReviewResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.service.ProductionWriteGuardService;
import org.apache.datawise.sqlparser.support.SqlTextSupport;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;
import java.util.zip.GZIPInputStream;

@Service
public class DatabaseRestoreService {

    private final BackupArtifactStore artifactStore;
    private final ConnectionExecutionContext connectionContext;
    private final SqlService sqlService;
    private final SqlReviewService sqlReviewService;
    private final ProductionWriteGuardService productionWriteGuardService;

    public DatabaseRestoreService(
            BackupArtifactStore artifactStore,
            ConnectionExecutionContext connectionContext,
            SqlService sqlService,
            SqlReviewService sqlReviewService,
            ProductionWriteGuardService productionWriteGuardService
    ) {
        this.artifactStore = artifactStore;
        this.connectionContext = connectionContext;
        this.sqlService = sqlService;
        this.sqlReviewService = sqlReviewService;
        this.productionWriteGuardService = productionWriteGuardService;
    }

    public DatabaseRestorePreflight preflight(
            Path artifactDir,
            String targetConnectionId,
            String targetDatabase,
            boolean productionAck,
            long userId
    ) throws IOException {
        BackupManifest manifest = artifactStore.readManifest(artifactDir);
        if (!BackupPolicy.TYPE_DATABASE.equals(manifest.getType())) {
            throw new IllegalArgumentException("artifact is not a database backup");
        }
        verifyArtifactFiles(artifactDir, manifest);

        ConnectionExecutionContext.ResolvedConnectionWithDatabase resolved =
                connectionContext.requireAvailableWithDatabaseForCurrentUser(
                        targetConnectionId, targetDatabase, "connection not found");
        ConnectionEntity entity = resolved.entity();

        List<String> risks = new ArrayList<>();
        Path previewFile = firstSqlArchive(artifactDir, manifest);
        if (previewFile != null) {
            String sqlPreview = readSqlPreview(previewFile, 64 * 1024);
            for (String statement : SqlTextSupport.splitStatements(sqlPreview)) {
                assessStatementRisk(statement, risks);
            }
        }
        if (isPerTable(manifest)) {
            risks.add("per-table backup: " + resolveTableFiles(artifactDir, manifest).size() + " table file(s)");
        }
        if (ConnectionEnvironmentSupport.isProduction(entity) && !productionAck) {
            risks.add("productionAck required for production target");
        }

        boolean allowed = !ConnectionEnvironmentSupport.isProduction(entity) || productionAck;
        return new DatabaseRestorePreflight(manifest, risks, allowed);
    }

    public void restore(
            Path artifactDir,
            RestoreJob job,
            long userId,
            Supplier<Boolean> cancelCheck,
            java.util.function.Consumer<BackupProgress> progressCallback
    ) throws Exception {
        BackupManifest manifest = artifactStore.readManifest(artifactDir);
        verifyArtifactFiles(artifactDir, manifest);

        String targetConnectionId = job.getTargetConnectionId();
        String targetDatabase = job.getTargetDatabase();
        ConnectionExecutionContext.ResolvedConnectionWithDatabase resolved =
                connectionContext.requireAvailableWithDatabaseForCurrentUser(
                        targetConnectionId, targetDatabase, "connection not found");
        ConnectionEntity entity = resolved.entity();

        if (ConnectionEnvironmentSupport.isProduction(entity) && !job.isProductionAck()) {
            throw new IllegalArgumentException("productionAck=true is required for production restore");
        }

        List<Path> archives = resolveSqlArchivesInOrder(artifactDir, manifest);
        if (archives.isEmpty()) {
            throw new IllegalArgumentException("no SQL archives found in backup artifact");
        }

        int total = archives.size();
        int index = 0;
        for (Path archive : archives) {
            if (cancelCheck.get()) {
                throw new RestoreCancelledException("restore cancelled after " + index + " table file(s)");
            }
            executeSqlArchive(archive, entity, targetConnectionId, targetDatabase, userId, job.getId(), cancelCheck);
            index++;
            progressCallback.accept(new BackupProgress("tables", index, total));
        }
    }

    private void executeSqlArchive(
            Path gzFile,
            ConnectionEntity entity,
            String targetConnectionId,
            String targetDatabase,
            long userId,
            String jobId,
            Supplier<Boolean> cancelCheck
    ) throws Exception {
        try (InputStream in = Files.newInputStream(gzFile);
             GZIPInputStream gzip = new GZIPInputStream(in);
             java.io.InputStreamReader reader = new java.io.InputStreamReader(gzip, StandardCharsets.UTF_8)) {
            StringBuilder buf = new StringBuilder(8192);
            int ch;
            while ((ch = reader.read()) != -1) {
                buf.append((char) ch);
                if (ch == ';' && SqlTextSupport.isSemicolonOutsideLiteral(buf.toString(), buf.length() - 1)) {
                    String statement = buf.substring(0, buf.length() - 1).trim();
                    buf.setLength(0);
                    executeRestoreStatement(
                            statement, entity, targetConnectionId, targetDatabase, userId, jobId, cancelCheck, gzFile);
                }
            }
            String tail = buf.toString().trim();
            executeRestoreStatement(tail, entity, targetConnectionId, targetDatabase, userId, jobId, cancelCheck, gzFile);
        }
    }

    private void executeRestoreStatement(
            String statement,
            ConnectionEntity entity,
            String targetConnectionId,
            String targetDatabase,
            long userId,
            String jobId,
            Supplier<Boolean> cancelCheck,
            Path gzFile
    ) throws Exception {
        if (statement == null || statement.isBlank() || statement.startsWith("--")) {
            return;
        }
        if (cancelCheck.get()) {
            throw new RestoreCancelledException("restore cancelled while executing " + gzFile.getFileName());
        }
        SqlReviewResultDto review = sqlReviewService.review(
                new SqlReviewRequest(statement, targetConnectionId, targetDatabase)
        );
        if (!review.allowed()) {
            throw new IllegalArgumentException("SQL blocked by review: " + review.findings());
        }
        productionWriteGuardService.requireProductionWriteAllowed(
                userId,
                entity,
                statement,
                "backup-restore:" + jobId
        );
        sqlService.execute(new ExecuteSqlRequest(
                statement,
                targetConnectionId,
                targetDatabase,
                null,
                null,
                null,
                null,
                "backup-restore"
        ));
    }

    private void verifyArtifactFiles(Path artifactDir, BackupManifest manifest) throws IOException {
        if (manifest.getFiles() == null || manifest.getFiles().isEmpty()) {
            Path legacy = artifactDir.resolve(BackupArtifactStore.DATABASE_ARCHIVE);
            if (!Files.isRegularFile(legacy) || Files.size(legacy) <= 0) {
                throw new IllegalArgumentException("backup artifact has no files");
            }
            // Legacy single-archive backups predate manifest file checksums — require non-empty archive only.
            return;
        }
        for (BackupManifest.BackupManifestFile file : manifest.getFiles()) {
            Path dataFile = artifactDir.resolve(file.getName()).normalize();
            if (!dataFile.startsWith(artifactDir.normalize())) {
                throw new IllegalArgumentException("invalid artifact path: " + file.getName());
            }
            if (!Files.isRegularFile(dataFile)) {
                throw new IllegalArgumentException("missing artifact file: " + file.getName());
            }
            ZipArchiveSupport.verifyChecksum(dataFile, file.getSha256());
        }
    }

    private static boolean isPerTable(BackupManifest manifest) {
        if (manifest.getDatabase() != null
                && BackupStatsDocument.LAYOUT_PER_TABLE.equalsIgnoreCase(manifest.getDatabase().getLayout())) {
            return true;
        }
        return manifest.getFiles() != null && manifest.getFiles().stream()
                .anyMatch(f -> f.getName() != null && f.getName().startsWith(BackupArtifactStore.DATABASE_TABLES_DIR + "/"));
    }

    private List<Path> resolveSqlArchivesInOrder(Path artifactDir, BackupManifest manifest) throws IOException {
        if (isPerTable(manifest)) {
            return resolveTableFiles(artifactDir, manifest);
        }
        Path legacy = artifactDir.resolve(BackupArtifactStore.DATABASE_ARCHIVE);
        if (Files.exists(legacy)) {
            return List.of(legacy);
        }
        return resolveTableFiles(artifactDir, manifest);
    }

    private List<Path> resolveTableFiles(Path artifactDir, BackupManifest manifest) throws IOException {
        List<Path> ordered = new ArrayList<>();
        BackupStatsDocument stats = artifactStore.readStats(artifactDir);
        if (stats != null && stats.getTables() != null && !stats.getTables().isEmpty()) {
            for (BackupTableStat table : stats.getTables()) {
                if (!BackupTableStat.STATUS_SUCCESS.equals(table.getStatus())) {
                    continue;
                }
                Path path = artifactStore.tableArchivePath(artifactDir, table.getFileName());
                if (Files.exists(path)) {
                    ordered.add(path);
                }
            }
            if (!ordered.isEmpty()) {
                return ordered;
            }
        }
        if (manifest.getFiles() != null) {
            for (BackupManifest.BackupManifestFile file : manifest.getFiles()) {
                if (file.getName() == null || !file.getName().endsWith(".sql.gz")) {
                    continue;
                }
                Path path = artifactDir.resolve(file.getName()).normalize();
                if (Files.exists(path)) {
                    ordered.add(path);
                }
            }
        }
        return ordered;
    }

    private Path firstSqlArchive(Path artifactDir, BackupManifest manifest) throws IOException {
        List<Path> archives = resolveSqlArchivesInOrder(artifactDir, manifest);
        return archives.isEmpty() ? null : archives.get(0);
    }

    private static void assessStatementRisk(String statement, List<String> risks) {
        String normalized = SqlTextSupport.normalizeForClassification(statement);
        if (SqlWriteClassifier.requiresWriteAccess(statement)) {
            if (!risks.contains("contains write operations")) {
                risks.add("contains write operations");
            }
        }
        if (normalized.startsWith("DROP ") || normalized.contains(" DROP ")) {
            if (!risks.contains("contains DROP statements")) {
                risks.add("contains DROP statements");
            }
        }
        if (normalized.startsWith("DELETE ") || normalized.contains(" DELETE ")) {
            if (!risks.contains("contains DELETE statements")) {
                risks.add("contains DELETE statements");
            }
        }
        if (statement.contains(";") && statement.indexOf(';') < statement.length() - 1) {
            if (!risks.contains("contains multiple statements")) {
                risks.add("contains multiple statements");
            }
        }
    }

    private static String readSqlPreview(Path gzFile, int maxBytes) throws IOException {
        try (InputStream in = Files.newInputStream(gzFile);
             GZIPInputStream gzip = new GZIPInputStream(in)) {
            byte[] buf = gzip.readNBytes(maxBytes);
            return new String(buf, StandardCharsets.UTF_8);
        }
    }

    public record DatabaseRestorePreflight(
            BackupManifest manifest,
            List<String> riskFlags,
            boolean allowed
    ) {
    }

    public static class RestoreCancelledException extends RuntimeException {
        public RestoreCancelledException(String message) {
            super(message);
        }
    }
}
