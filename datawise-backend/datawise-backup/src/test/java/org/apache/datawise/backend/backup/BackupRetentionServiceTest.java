package org.apache.datawise.backend.backup;

import org.apache.datawise.backend.backup.model.BackupRetentionSpec;
import org.apache.datawise.backend.config.BackupProperties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class BackupRetentionServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void selectForDeletion_byMaxCount() {
        BackupRetentionService service = new BackupRetentionService(null, new BackupProperties());
        BackupRetentionSpec spec = new BackupRetentionSpec();
        spec.setMaxCount(2);

        Instant t1 = Instant.parse("2026-01-01T00:00:00Z");
        Instant t2 = Instant.parse("2026-01-02T00:00:00Z");
        Instant t3 = Instant.parse("2026-01-03T00:00:00Z");

        List<BackupRetentionService.RetentionCandidate> candidates = List.of(
                new BackupRetentionService.RetentionCandidate(Path.of("a"), t1, 100),
                new BackupRetentionService.RetentionCandidate(Path.of("b"), t2, 100),
                new BackupRetentionService.RetentionCandidate(Path.of("c"), t3, 100)
        );

        var toDelete = service.selectForDeletion(candidates, spec);
        assertEquals(1, toDelete.size());
        assertEquals(Path.of("a"), toDelete.get(0).dir());
    }
}
