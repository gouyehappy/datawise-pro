package org.apache.datawise.backend.domain.pack;

import org.apache.datawise.backend.common.DatawiseErrorCodes;
import org.apache.datawise.backend.common.PackEntitlementException;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;

/**
 * Sealed pack payloads ({@code *.sealed}): AES-GCM with key derived from license signing material.
 * Format: {@code DWSEAL1} + 12-byte IV + ciphertext (includes GCM tag).
 */
public final class PackSealedCrypto {

    public static final String MAGIC = "DWSEAL1";
    public static final String SEALED_SUFFIX = ".sealed";
    private static final int IV_LEN = 12;
    private static final int TAG_BITS = 128;

    private PackSealedCrypto() {
    }

    /** Derive AES-256 key: SHA-256(secret || 0 || packId || 0 || siteId). */
    public static SecretKey deriveKey(String signingSecret, String packId, String siteId) {
        try {
            if (signingSecret == null || signingSecret.isBlank()) {
                throw new IllegalArgumentException("signing secret is required");
            }
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            md.update(signingSecret.getBytes(StandardCharsets.UTF_8));
            md.update((byte) 0);
            md.update((packId != null ? packId : "").getBytes(StandardCharsets.UTF_8));
            md.update((byte) 0);
            md.update((siteId != null ? siteId : "").getBytes(StandardCharsets.UTF_8));
            return new SecretKeySpec(md.digest(), "AES");
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalStateException("Key derivation failed", ex);
        }
    }

    public static byte[] seal(byte[] plain, SecretKey key) {
        if (plain == null) {
            plain = new byte[0];
        }
        try {
            byte[] iv = new byte[IV_LEN];
            new SecureRandom().nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] cipherText = cipher.doFinal(plain);
            byte[] magic = MAGIC.getBytes(StandardCharsets.US_ASCII);
            ByteBuffer buf = ByteBuffer.allocate(magic.length + iv.length + cipherText.length);
            buf.put(magic);
            buf.put(iv);
            buf.put(cipherText);
            return buf.array();
        } catch (Exception ex) {
            throw integrity("Seal failed: " + ex.getMessage());
        }
    }

    public static byte[] unseal(byte[] sealed, SecretKey key) {
        if (sealed == null || sealed.length < MAGIC.length() + IV_LEN + 16) {
            throw integrity("Sealed payload too short");
        }
        byte[] magic = MAGIC.getBytes(StandardCharsets.US_ASCII);
        for (int i = 0; i < magic.length; i++) {
            if (sealed[i] != magic[i]) {
                throw integrity("Not a DWSEAL1 payload");
            }
        }
        try {
            byte[] iv = Arrays.copyOfRange(sealed, magic.length, magic.length + IV_LEN);
            byte[] cipherText = Arrays.copyOfRange(sealed, magic.length + IV_LEN, sealed.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            return cipher.doFinal(cipherText);
        } catch (PackEntitlementException ex) {
            throw ex;
        } catch (Exception ex) {
            throw integrity("Unseal failed (wrong license/site or tampered)");
        }
    }

    public static boolean isSealedEntryName(String name) {
        return name != null && name.toLowerCase().endsWith(SEALED_SUFFIX);
    }

    public static String stripSealedSuffix(String name) {
        if (!isSealedEntryName(name)) {
            return name;
        }
        return name.substring(0, name.length() - SEALED_SUFFIX.length());
    }

    public static String toSealedEntryName(String name) {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("entry name required");
        }
        if (isSealedEntryName(name)) {
            return name;
        }
        return name + SEALED_SUFFIX;
    }

    private static PackEntitlementException integrity(String message) {
        return new PackEntitlementException(DatawiseErrorCodes.PACK_INTEGRITY_FAILED, message, 500);
    }
}
