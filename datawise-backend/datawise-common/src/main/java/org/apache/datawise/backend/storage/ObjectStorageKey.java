package org.apache.datawise.backend.storage;

import java.util.Objects;

/**
 * Logical object address: optional bucket + slash-normalized relative path (no leading slash).
 */
public final class ObjectStorageKey {

    private final String bucket;
    private final String objectKey;

    public ObjectStorageKey(String bucket, String objectKey) {
        this.bucket = bucket == null || bucket.isBlank() ? null : bucket.trim();
        this.objectKey = normalize(objectKey);
    }

    public static ObjectStorageKey of(String objectKey) {
        return new ObjectStorageKey(null, objectKey);
    }

    public static ObjectStorageKey of(String bucket, String objectKey) {
        return new ObjectStorageKey(bucket, objectKey);
    }

    public String bucket() {
        return bucket;
    }

    public String objectKey() {
        return objectKey;
    }

    private static String normalize(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("objectKey is required");
        }
        String trimmed = raw.trim().replace('\\', '/');
        while (trimmed.startsWith("/")) {
            trimmed = trimmed.substring(1);
        }
        if (trimmed.isBlank() || trimmed.contains("..")) {
            throw new IllegalArgumentException("objectKey must be a relative path without '..': " + raw);
        }
        return trimmed;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof ObjectStorageKey that)) {
            return false;
        }
        return Objects.equals(bucket, that.bucket) && objectKey.equals(that.objectKey);
    }

    @Override
    public int hashCode() {
        return Objects.hash(bucket, objectKey);
    }

    @Override
    public String toString() {
        return bucket == null ? objectKey : bucket + "/" + objectKey;
    }
}
