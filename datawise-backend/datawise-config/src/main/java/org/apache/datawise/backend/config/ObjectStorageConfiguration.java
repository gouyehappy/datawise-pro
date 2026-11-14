package org.apache.datawise.backend.config;

import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.storage.LocalObjectStorageProvider;
import org.apache.datawise.backend.storage.ObjectStorageProvider;
import org.apache.datawise.backend.storage.S3CompatibleObjectStorageProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.nio.file.Path;

/**
 * MetaForge A3：按 {@link ObjectStorageProperties#getProvider()} 装配
 * {@link ObjectStorageProvider}（默认 local）。
 */
@Configuration
public class ObjectStorageConfiguration {

    @Bean
    public ObjectStorageProvider objectStorageProvider(
            ObjectStorageProperties properties,
            ConfigDirectoryService configDirectory
    ) {
        if (properties.isS3()) {
            ObjectStorageProperties.S3 s3 = properties.getS3();
            return new S3CompatibleObjectStorageProvider(
                    s3.getEndpoint(),
                    s3.getRegion(),
                    s3.getAccessKey(),
                    s3.getSecretKey(),
                    s3.getBucket(),
                    s3.isPathStyleAccess()
            );
        }
        Path root = resolveLocalRoot(properties.getLocalRoot(), configDirectory);
        return new LocalObjectStorageProvider(root);
    }

    static Path resolveLocalRoot(String localRoot, ConfigDirectoryService configDirectory) {
        Path candidate = Path.of(localRoot == null || localRoot.isBlank() ? "object-store" : localRoot.trim());
        if (candidate.isAbsolute()) {
            return candidate.normalize();
        }
        return configDirectory.resolve(candidate.toString()).normalize();
    }
}
