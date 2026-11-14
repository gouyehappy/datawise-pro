package org.apache.datawise.backend.backup;

import org.apache.datawise.backend.config.ObjectStorageProperties;
import org.apache.datawise.backend.storage.LocalObjectStorageProvider;
import org.apache.datawise.backend.storage.ObjectStorageKey;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BackupObjectStorageMirrorTest {

    @TempDir
    Path tempDir;

    @Test
    void skipsWhenPublishDisabled() throws Exception {
        Path artifact = tempDir.resolve("artifact");
        Files.createDirectories(artifact);
        Files.writeString(artifact.resolve("manifest.json"), "{}");

        ObjectStorageProperties props = new ObjectStorageProperties();
        props.setPublishBackups(false);
        LocalObjectStorageProvider storage = new LocalObjectStorageProvider(tempDir.resolve("store"));
        BackupObjectStorageMirror mirror = new BackupObjectStorageMirror(storage, props);

        mirror.mirrorArtifactIfEnabled(artifact, "workbench/default/run-1");
        assertFalse(storage.exists(ObjectStorageKey.of("backups/workbench/default/run-1/manifest.json")));
    }

    @Test
    void mirrorsFilesWhenEnabled() throws Exception {
        Path artifact = tempDir.resolve("artifact");
        Files.createDirectories(artifact);
        Files.writeString(artifact.resolve("manifest.json"), "{\"ok\":true}", StandardCharsets.UTF_8);
        Files.write(artifact.resolve("workbench.zip"), new byte[]{1, 2, 3});

        ObjectStorageProperties props = new ObjectStorageProperties();
        props.setPublishBackups(true);
        props.setBackupKeyPrefix("backups");
        LocalObjectStorageProvider storage = new LocalObjectStorageProvider(tempDir.resolve("store"));
        BackupObjectStorageMirror mirror = new BackupObjectStorageMirror(storage, props);

        mirror.mirrorArtifactIfEnabled(artifact, "workbench/default/run-1");

        ObjectStorageKey manifestKey = ObjectStorageKey.of("backups/workbench/default/run-1/manifest.json");
        assertTrue(storage.exists(manifestKey));
        assertEquals("{\"ok\":true}", new String(storage.get(manifestKey).readAllBytes(), StandardCharsets.UTF_8));
        assertTrue(storage.exists(ObjectStorageKey.of("backups/workbench/default/run-1/workbench.zip")));
    }

    @Test
    void joinPrefixNormalizesSlashes() {
        assertEquals("backups/workbench/a", BackupObjectStorageMirror.joinPrefix("backups", "/workbench/a/"));
        assertEquals("backups", BackupObjectStorageMirror.joinPrefix("backups", "  "));
    }
}
