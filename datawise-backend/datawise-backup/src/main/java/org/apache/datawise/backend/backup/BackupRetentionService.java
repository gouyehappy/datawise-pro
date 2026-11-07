package org.apache.datawise.backend.backup;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.backup.model.BackupManifest;
import org.apache.datawise.backend.backup.model.BackupRetentionSpec;
import org.apache.datawise.backend.config.BackupProperties;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
public class BackupRetentionService {

    private final BackupArtifactStore artifactStore;
    private final BackupProperties backupProperties;

    public BackupRetentionService(BackupArtifactStore artifactStore, BackupProperties backupProperties) {
        this.artifactStore = artifactStore;
        this.backupProperties = backupProperties;
    }

    public int enforceRetention(Path root, BackupRetentionSpec retention, String typeFilter) throws IOException {
        if (retention == null) {
            return 0;
        }
        List<RetentionCandidate> candidates = loadSuccessCandidates(root, typeFilter);
        List<RetentionCandidate> toDelete = selectForDeletion(candidates, retention);
        for (RetentionCandidate candidate : toDelete) {
            artifactStore.deleteArtifact(candidate.dir());
        }
        return toDelete.size();
    }

    List<RetentionCandidate> selectForDeletion(List<RetentionCandidate> candidates, BackupRetentionSpec retention) {
        List<RetentionCandidate> sorted = new ArrayList<>(candidates);
        sorted.sort(Comparator.comparing(RetentionCandidate::createdAt, Comparator.nullsLast(Comparator.naturalOrder())));

        java.util.Set<Path> delete = new java.util.LinkedHashSet<>();

        Integer maxCount = retention.getMaxCount();
        if (maxCount != null && maxCount > 0 && sorted.size() > maxCount) {
            int excess = sorted.size() - maxCount;
            for (int i = 0; i < excess; i++) {
                delete.add(sorted.get(i).dir());
            }
        }

        Integer maxAgeDays = retention.getMaxAgeDays();
        if (maxAgeDays != null && maxAgeDays > 0) {
            Instant cutoff = Instant.now().minus(maxAgeDays, ChronoUnit.DAYS);
            for (RetentionCandidate candidate : sorted) {
                if (candidate.createdAt() != null && candidate.createdAt().isBefore(cutoff)) {
                    delete.add(candidate.dir());
                }
            }
        }

        Long maxTotalBytes = retention.getMaxTotalBytes();
        if (maxTotalBytes != null && maxTotalBytes > 0) {
            long total = sorted.stream().mapToLong(RetentionCandidate::sizeBytes).sum();
            for (RetentionCandidate candidate : sorted) {
                if (total <= maxTotalBytes) {
                    break;
                }
                if (delete.add(candidate.dir())) {
                    total -= candidate.sizeBytes();
                }
            }
        }

        return sorted.stream().filter(c -> delete.contains(c.dir())).toList();
    }

    private List<RetentionCandidate> loadSuccessCandidates(Path root, String typeFilter) throws IOException {
        List<RetentionCandidate> candidates = new ArrayList<>();
        for (BackupArtifactStore.ArtifactSummary summary : artifactStore.listArtifacts(root, typeFilter, null, null)) {
            if (!"success".equalsIgnoreCase(summary.status())) {
                continue;
            }
            Path dir = Path.of(summary.path());
            long size = directorySize(dir);
            candidates.add(new RetentionCandidate(dir, summary.createdAt(), size));
        }
        return candidates;
    }

    private static long directorySize(Path dir) throws IOException {
        if (!Files.isDirectory(dir)) {
            return 0;
        }
        try (var walk = Files.walk(dir)) {
            return walk.filter(Files::isRegularFile).mapToLong(path -> {
                try {
                    return Files.size(path);
                } catch (IOException ex) {
                    return 0;
                }
            }).sum();
        }
    }

    record RetentionCandidate(Path dir, Instant createdAt, long sizeBytes) {
    }
}
