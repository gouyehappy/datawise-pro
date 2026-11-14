package org.apache.datawise.backend.storage;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PresignedGetObjectRequest;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.time.Duration;
import java.util.Objects;

/**
 * MetaForge A3：S3 兼容（MinIO / COS / OSS 走 S3 协议）实现，基于 AWS SDK v2。
 */
public final class S3CompatibleObjectStorageProvider implements ObjectStorageProvider, AutoCloseable {

    public static final String ID = "s3";

    private static final Duration DEFAULT_PRESIGN_TTL = Duration.ofMinutes(15);

    private final String endpoint;
    private final String region;
    private final String accessKey;
    private final String secretKey;
    private final String defaultBucket;
    private final boolean pathStyleAccess;
    private final S3Client client;
    private final S3Presigner presigner;
    private final boolean ownsClients;

    public S3CompatibleObjectStorageProvider(
            String endpoint,
            String region,
            String accessKey,
            String secretKey,
            String defaultBucket,
            boolean pathStyleAccess
    ) {
        this.endpoint = requireNonBlank(endpoint, "endpoint");
        this.region = region == null || region.isBlank() ? "us-east-1" : region.trim();
        this.accessKey = requireNonBlank(accessKey, "accessKey");
        this.secretKey = requireNonBlank(secretKey, "secretKey");
        this.defaultBucket = defaultBucket == null || defaultBucket.isBlank() ? null : defaultBucket.trim();
        this.pathStyleAccess = pathStyleAccess;
        StaticCredentialsProvider credentials = StaticCredentialsProvider.create(
                AwsBasicCredentials.create(this.accessKey, this.secretKey)
        );
        URI endpointUri = URI.create(this.endpoint);
        Region awsRegion = Region.of(this.region);
        this.client = S3Client.builder()
                .endpointOverride(endpointUri)
                .region(awsRegion)
                .credentialsProvider(credentials)
                .forcePathStyle(pathStyleAccess)
                .build();
        this.presigner = S3Presigner.builder()
                .endpointOverride(endpointUri)
                .region(awsRegion)
                .credentialsProvider(credentials)
                .serviceConfiguration(S3Configuration.builder()
                        .pathStyleAccessEnabled(pathStyleAccess)
                        .build())
                .build();
        this.ownsClients = true;
    }

    /** Package-visible for unit tests with mocked clients. */
    S3CompatibleObjectStorageProvider(
            String endpoint,
            String region,
            String accessKey,
            String secretKey,
            String defaultBucket,
            boolean pathStyleAccess,
            S3Client client,
            S3Presigner presigner
    ) {
        this.endpoint = requireNonBlank(endpoint, "endpoint");
        this.region = region == null || region.isBlank() ? "us-east-1" : region.trim();
        this.accessKey = requireNonBlank(accessKey, "accessKey");
        this.secretKey = requireNonBlank(secretKey, "secretKey");
        this.defaultBucket = defaultBucket == null || defaultBucket.isBlank() ? null : defaultBucket.trim();
        this.pathStyleAccess = pathStyleAccess;
        this.client = Objects.requireNonNull(client, "client");
        this.presigner = Objects.requireNonNull(presigner, "presigner");
        this.ownsClients = false;
    }

    @Override
    public String id() {
        return ID;
    }

    @Override
    public void put(ObjectStorageKey key, InputStream data, long contentLength, String contentType)
            throws ObjectStorageException {
        Objects.requireNonNull(data, "data");
        String bucket = resolveBucket(key);
        try {
            PutObjectRequest.Builder request = PutObjectRequest.builder()
                    .bucket(bucket)
                    .key(key.objectKey());
            if (contentType != null && !contentType.isBlank()) {
                request.contentType(contentType.trim());
            }
            RequestBody body;
            if (contentLength >= 0) {
                request.contentLength(contentLength);
                body = RequestBody.fromInputStream(data, contentLength);
            } else {
                byte[] bytes = data.readAllBytes();
                request.contentLength((long) bytes.length);
                body = RequestBody.fromBytes(bytes);
            }
            client.putObject(request.build(), body);
        } catch (IOException | SdkException ex) {
            throw wrap("put", key, ex);
        }
    }

    @Override
    public InputStream get(ObjectStorageKey key) throws ObjectStorageException {
        String bucket = resolveBucket(key);
        try {
            return client.getObject(GetObjectRequest.builder()
                    .bucket(bucket)
                    .key(key.objectKey())
                    .build());
        } catch (NoSuchKeyException ex) {
            throw new ObjectStorageException("Object not found: " + key, ex);
        } catch (S3Exception ex) {
            if (ex.statusCode() == 404) {
                throw new ObjectStorageException("Object not found: " + key, ex);
            }
            throw wrap("get", key, ex);
        } catch (SdkException ex) {
            throw wrap("get", key, ex);
        }
    }

    @Override
    public void delete(ObjectStorageKey key) throws ObjectStorageException {
        String bucket = resolveBucket(key);
        try {
            client.deleteObject(DeleteObjectRequest.builder()
                    .bucket(bucket)
                    .key(key.objectKey())
                    .build());
        } catch (SdkException ex) {
            throw wrap("delete", key, ex);
        }
    }

    @Override
    public boolean exists(ObjectStorageKey key) throws ObjectStorageException {
        String bucket = resolveBucket(key);
        try {
            client.headObject(HeadObjectRequest.builder()
                    .bucket(bucket)
                    .key(key.objectKey())
                    .build());
            return true;
        } catch (NoSuchKeyException ex) {
            return false;
        } catch (S3Exception ex) {
            if (ex.statusCode() == 404) {
                return false;
            }
            throw wrap("exists", key, ex);
        } catch (SdkException ex) {
            throw wrap("exists", key, ex);
        }
    }

    @Override
    public URI presignGet(ObjectStorageKey key, Duration ttl) throws ObjectStorageException {
        String bucket = resolveBucket(key);
        Duration effective = ttl == null || ttl.isZero() || ttl.isNegative() ? DEFAULT_PRESIGN_TTL : ttl;
        try {
            PresignedGetObjectRequest signed = presigner.presignGetObject(
                    GetObjectPresignRequest.builder()
                            .signatureDuration(effective)
                            .getObjectRequest(GetObjectRequest.builder()
                                    .bucket(bucket)
                                    .key(key.objectKey())
                                    .build())
                            .build()
            );
            return signed.url().toURI();
        } catch (SdkException | java.net.URISyntaxException ex) {
            throw wrap("presignGet", key, ex);
        }
    }

    @Override
    public void close() {
        if (!ownsClients) {
            return;
        }
        try {
            client.close();
        } finally {
            presigner.close();
        }
    }

    public String endpoint() {
        return endpoint;
    }

    public String region() {
        return region;
    }

    public String defaultBucket() {
        return defaultBucket;
    }

    public boolean pathStyleAccess() {
        return pathStyleAccess;
    }

    String resolveBucket(ObjectStorageKey key) throws ObjectStorageException {
        String bucket = key.bucket() != null ? key.bucket() : defaultBucket;
        if (bucket == null || bucket.isBlank()) {
            throw new ObjectStorageException("S3 bucket is required for key " + key);
        }
        return bucket;
    }

    private static ObjectStorageException wrap(String op, ObjectStorageKey key, Exception cause) {
        return new ObjectStorageException(
                "S3 " + op + " failed for key " + key + ": " + cause.getMessage(),
                cause
        );
    }

    private static String requireNonBlank(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " is required for S3-compatible storage");
        }
        return value.trim();
    }
}
