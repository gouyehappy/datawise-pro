package org.apache.datawise.backend.common.support;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * Digests secret material for cache keys / fingerprints so plaintext never stays in long-lived maps.
 */
public final class SecretMaterialDigest {

    private SecretMaterialDigest() {
    }

    /** SHA-256 hex of {@code value}; empty/null → empty string. */
    public static String sha256Hex(String value) {
        if (value == null || value.isEmpty()) {
            return "";
        }
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 not available", ex);
        }
    }
}
