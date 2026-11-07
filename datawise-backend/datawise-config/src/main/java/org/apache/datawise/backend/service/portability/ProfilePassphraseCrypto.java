package org.apache.datawise.backend.service.portability;

import javax.crypto.Cipher;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.security.spec.KeySpec;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Passphrase-wrapped AES-256-GCM for profile portability secrets.
 * <p>
 * KDF is PBKDF2-HMAC-SHA256 (JDK built-in). Schema field {@code kdf} allows future Argon2id.
 */
public final class ProfilePassphraseCrypto {

    public static final String KDF_ALG = "PBKDF2WithHmacSHA256";
    public static final int KDF_ITERATIONS = 210_000;
    public static final int SALT_BYTES = 16;
    public static final int KEY_BYTES = 32;
    public static final int IV_BYTES = 12;
    public static final int TAG_BITS = 128;
    public static final int MIN_PASSPHRASE_LENGTH = 4;

    private static final SecureRandom RANDOM = new SecureRandom();

    private ProfilePassphraseCrypto() {
    }

    public record SealedSecrets(byte[] sealedBin, Map<String, Object> kdf) {
    }

    public static SealedSecrets seal(String passphrase, String plaintextJson) {
        if (passphrase == null || passphrase.isBlank()) {
            throw new IllegalArgumentException("PASSPHRASE_REQUIRED");
        }
        if (passphrase.length() < MIN_PASSPHRASE_LENGTH) {
            throw new IllegalArgumentException("PASSPHRASE_TOO_SHORT");
        }
        byte[] salt = new byte[SALT_BYTES];
        RANDOM.nextBytes(salt);
        SecretKeySpec key = deriveKey(passphrase, salt, KDF_ITERATIONS);
        byte[] iv = new byte[IV_BYTES];
        RANDOM.nextBytes(iv);
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] ciphertext = cipher.doFinal(plaintextJson.getBytes(StandardCharsets.UTF_8));
            ByteBuffer buffer = ByteBuffer.allocate(iv.length + ciphertext.length);
            buffer.put(iv);
            buffer.put(ciphertext);
            Map<String, Object> kdf = new LinkedHashMap<>();
            kdf.put("alg", KDF_ALG);
            kdf.put("iterations", KDF_ITERATIONS);
            kdf.put("salt", Base64.getEncoder().encodeToString(salt));
            kdf.put("keyLen", KEY_BYTES);
            return new SealedSecrets(buffer.array(), kdf);
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("Failed to seal profile secrets", ex);
        }
    }

    public static String unseal(String passphrase, byte[] sealedBin, Map<String, Object> kdf) {
        if (passphrase == null || passphrase.isBlank()) {
            throw new IllegalArgumentException("PASSPHRASE_REQUIRED");
        }
        if (sealedBin == null || sealedBin.length <= IV_BYTES) {
            throw new IllegalArgumentException("SEALED_SECRETS_INVALID");
        }
        if (kdf == null) {
            throw new IllegalArgumentException("KDF_REQUIRED");
        }
        String alg = stringVal(kdf.get("alg"));
        if (alg != null && !alg.isBlank() && !KDF_ALG.equals(alg)) {
            throw new IllegalArgumentException("UNSUPPORTED_KDF:" + alg);
        }
        int iterations = intVal(kdf.get("iterations"), KDF_ITERATIONS);
        int keyLen = intVal(kdf.get("keyLen"), KEY_BYTES);
        String saltB64 = stringVal(kdf.get("salt"));
        if (saltB64 == null || saltB64.isBlank()) {
            throw new IllegalArgumentException("KDF_SALT_REQUIRED");
        }
        byte[] salt = Base64.getDecoder().decode(saltB64);
        SecretKeySpec key = deriveKey(passphrase, salt, iterations, keyLen);
        ByteBuffer buffer = ByteBuffer.wrap(sealedBin);
        byte[] iv = new byte[IV_BYTES];
        buffer.get(iv);
        byte[] ciphertext = new byte[buffer.remaining()];
        buffer.get(ciphertext);
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] plaintext = cipher.doFinal(ciphertext);
            return new String(plaintext, StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException ex) {
            throw new IllegalArgumentException("PASSPHRASE_INCORRECT", ex);
        }
    }

    private static SecretKeySpec deriveKey(String passphrase, byte[] salt, int iterations) {
        return deriveKey(passphrase, salt, iterations, KEY_BYTES);
    }

    private static SecretKeySpec deriveKey(String passphrase, byte[] salt, int iterations, int keyLen) {
        try {
            KeySpec spec = new PBEKeySpec(passphrase.toCharArray(), salt, iterations, keyLen * 8);
            byte[] keyBytes = SecretKeyFactory.getInstance(KDF_ALG).generateSecret(spec).getEncoded();
            return new SecretKeySpec(keyBytes, "AES");
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("Failed to derive passphrase key", ex);
        }
    }

    private static String stringVal(Object value) {
        return value instanceof String text ? text : value != null ? String.valueOf(value) : null;
    }

    private static int intVal(Object value, int fallback) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value instanceof String text && !text.isBlank()) {
            try {
                return Integer.parseInt(text.trim());
            } catch (NumberFormatException ignored) {
                return fallback;
            }
        }
        return fallback;
    }
}
