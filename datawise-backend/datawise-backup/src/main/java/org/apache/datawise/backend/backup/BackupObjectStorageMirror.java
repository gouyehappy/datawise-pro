package org.apache.datawise.backend.backup;

import org.apache.datawise.backend.config.ObjectStorageProperties;
import org.apache.datawise.backend.storage.ObjectStorageException;
import org.apache.datawise.backend.storage.ObjectStorageKey;
import org.apache.datawise.backend.storage.ObjectStorageProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;

/**
 * MetaForge A3：备份产物可选镜像到 {@link ObjectStorageProvider}
 *（{@code datawise.object-storage.publish-backups=true}）。
 */
@Component
public class BackupObjectStorageMirror {

    private static final Logger log = LoggerFactory.getLogger(BackupObjectStorageMirror.class);

    private final ObjectStorageProvider storage;
    private final ObjectStorageProperties properties;

    public BackupObjectStorageMirror(ObjectStorageProvider storage, ObjectStorageProperties properties) {
        this.storage = storage;
        this.properties = properties;
    }

    public void mirrorArtifactIfEnabled(Path artifactDir, String relativePrefix) throws IOException {
        if (!properties.isPublishBackups()) {
            return;
        }
        if (artifactDir == null || !Files.isDirectory(artifactDir)) {
            return;
        }
        String prefix = joinPrefix(properties.getBackupKeyPrefix(), relativePrefix);
        int count = 0;
        try (Stream<Path> walk = Files.walk(artifactDir)) {
            for (Path file : walk.filter(Files::isRegularFile).toList()) {
                Path relative = artifactDir.relativize(file);
                String objectKey = prefix + "/" + relative.toString().replace('\\', '/');
                ObjectStorageKey key = ObjectStorageKey.of(objectKey);
                long size = Files.size(file);
                try (InputStream in = Files.newInputStream(file)) {
                    storage.put(key, in, size, guessContentType(file));
                } catch (ObjectStorageException ex) {
                    throw new IOException("Failed to mirror backup object " + key, ex);
                }
                count++;
            }
        }
        log.info("Mirrored {} backup file(s) to object storage prefix {}", count, prefix);
    }

    static String joinPrefix(String rootPrefix, String relativePrefix) {
        String root = rootPrefix == null || rootPrefix.isBlank() ? "backups" : rootPrefix.trim();
        if (relativePrefix == null || relativePrefix.isBlank()) {
            return root;
        }
        String rel = relativePrefix.trim().replace('\\', '/').replaceAll("^/+|/+$", "");
        return rel.isEmpty() ? root : root + "/" + rel;
    }

    private static String guessContentType(Path file) {
        String name = file.getFileName().toString().toLowerCase();
        if (name.endsWith(".zip")) {
            return "application/zip";
        }
        if (name.endsWith(".json")) {
            return "application/json";
        }
        if (name.endsWith(".sql")) {
            return "application/sql";
        }
        return "application/octet-stream";
    }
}
