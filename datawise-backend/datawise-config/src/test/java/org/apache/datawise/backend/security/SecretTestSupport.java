package org.apache.datawise.backend.security;

import org.apache.datawise.backend.configstore.ConfigDirectoryService;

import javax.crypto.spec.SecretKeySpec;
import java.nio.file.Path;
import java.util.Arrays;

public final class SecretTestSupport {

    private SecretTestSupport() {
    }

    public static SecretValueCodec testCodec() {
        byte[] key = new byte[32];
        Arrays.fill(key, (byte) 9);
        SecretEncryptionService encryptionService = new SecretEncryptionService();
        return new SecretValueCodec(encryptionService, new SecretKeySpec(key, "AES"));
    }

    public static SecretValueCodec testCodec(Path configRoot) {
        byte[] key = new byte[32];
        Arrays.fill(key, (byte) 9);
        SecretEncryptionService encryptionService = new SecretEncryptionService();
        SecretReferenceResolver resolver = new SecretReferenceResolver(new ConfigDirectoryService(configRoot));
        return new SecretValueCodec(encryptionService, new SecretKeySpec(key, "AES"), resolver);
    }
}
