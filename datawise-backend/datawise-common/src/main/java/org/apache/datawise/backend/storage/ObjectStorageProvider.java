package org.apache.datawise.backend.storage;

import java.io.InputStream;
import java.net.URI;
import java.time.Duration;

/**
 * MetaForge A3：统一对象存储 SPI（备份归档、大文件导出、插件包远程落地）。
 * <p>实现侧负责凭据与协议细节；调用方只依赖 key / stream 契约。
 */
public interface ObjectStorageProvider {

    /** Stable provider id: {@code local}, {@code s3}, … */
    String id();

    void put(ObjectStorageKey key, InputStream data, long contentLength, String contentType)
            throws ObjectStorageException;

    InputStream get(ObjectStorageKey key) throws ObjectStorageException;

    void delete(ObjectStorageKey key) throws ObjectStorageException;

    boolean exists(ObjectStorageKey key) throws ObjectStorageException;

    /**
     * Time-limited read URL. Local provider may return a {@code file:} URI;
     * S3-compatible providers return HTTPS pre-signed URLs.
     */
    URI presignGet(ObjectStorageKey key, Duration ttl) throws ObjectStorageException;
}
