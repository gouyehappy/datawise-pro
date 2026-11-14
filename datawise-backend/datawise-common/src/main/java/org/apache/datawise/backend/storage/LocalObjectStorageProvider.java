package org.apache.datawise.backend.storage;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.Objects;

/**
 * MetaForge A3：本地文件系统实现。对象落在 {@code root/[bucket/]objectKey}；
 * {@link #presignGet} 返回 {@code file:} URI（ttl 忽略）。
 */
public final class LocalObjectStorageProvider implements ObjectStorageProvider {

    public static final String ID = "local";

    private final Path root;

    public LocalObjectStorageProvider(Path root) {
        this.root = Objects.requireNonNull(root, "root").toAbsolutePath().normalize();
    }

    @Override
    public String id() {
        return ID;
    }

    @Override
    public void put(ObjectStorageKey key, InputStream data, long contentLength, String contentType)
            throws ObjectStorageException {
        Objects.requireNonNull(data, "data");
        Path target = resolve(key);
        try {
            Files.createDirectories(target.getParent());
            Path temp = Files.createTempFile(target.getParent(), ".put-", ".tmp");
            try {
                try (OutputStream out = Files.newOutputStream(temp)) {
                    data.transferTo(out);
                }
                try {
                    Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
                } catch (AtomicMoveNotSupportedException ex) {
                    Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
                }
            } catch (IOException ex) {
                try {
                    Files.deleteIfExists(temp);
                } catch (IOException ignored) {
                    // best-effort
                }
                throw ex;
            }
        } catch (IOException ex) {
            throw new ObjectStorageException("Failed to put object " + key, ex);
        }
    }

    @Override
    public InputStream get(ObjectStorageKey key) throws ObjectStorageException {
        Path target = resolve(key);
        try {
            if (!Files.isRegularFile(target)) {
                throw new ObjectStorageException("Object not found: " + key);
            }
            return Files.newInputStream(target);
        } catch (ObjectStorageException ex) {
            throw ex;
        } catch (IOException ex) {
            throw new ObjectStorageException("Failed to get object " + key, ex);
        }
    }

    @Override
    public void delete(ObjectStorageKey key) throws ObjectStorageException {
        try {
            Files.deleteIfExists(resolve(key));
        } catch (IOException ex) {
            throw new ObjectStorageException("Failed to delete object " + key, ex);
        }
    }

    @Override
    public boolean exists(ObjectStorageKey key) throws ObjectStorageException {
        try {
            return Files.isRegularFile(resolve(key));
        } catch (ObjectStorageException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            throw new ObjectStorageException("Failed to check object " + key, ex);
        }
    }

    @Override
    public URI presignGet(ObjectStorageKey key, Duration ttl) throws ObjectStorageException {
        Path target = resolve(key);
        if (!Files.isRegularFile(target)) {
            throw new ObjectStorageException("Object not found: " + key);
        }
        return target.toUri();
    }

    Path root() {
        return root;
    }

    private Path resolve(ObjectStorageKey key) throws ObjectStorageException {
        Objects.requireNonNull(key, "key");
        Path relative = key.bucket() == null
                ? Path.of(key.objectKey())
                : Path.of(key.bucket(), key.objectKey());
        Path resolved = root.resolve(relative).normalize();
        if (!resolved.startsWith(root)) {
            throw new ObjectStorageException("Object key escapes storage root: " + key);
        }
        return resolved;
    }
}
